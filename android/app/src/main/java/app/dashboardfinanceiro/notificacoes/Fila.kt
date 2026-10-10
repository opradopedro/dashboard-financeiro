package app.dashboardfinanceiro.notificacoes

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.Normalizer
import java.util.UUID
import java.util.regex.Pattern

/**
 * Fila nativa persistente (SQLite) das notificações dos apps monitorados.
 *
 * - O serviço grava aqui mesmo com o app fechado; a gravação é síncrona, então nada se perde se o
 *   processo morrer logo depois.
 * - O lado web lê a fila ao abrir, guarda no próprio banco e só então confirma; só o que foi
 *   confirmado sai da fila. Se o app fechar no meio, os itens continuam aqui.
 * - A tabela "vistas" lembra as chaves por 30 dias: a mesma notificação (mesmo id no Android, mesmo
 *   texto e mesmo horário) não entra de novo, por exemplo quando o serviço reconecta e relê as que
 *   estão na barra. Repostar o mesmo id com o mesmo texto em até 2 minutos (atualização sem mudança)
 *   também conta como a mesma. O lado web ainda ignora chaves que já conhece.
 */
class Fila private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "fila_notificacoes.db", null, 2) {

    data class Item(val id: Long, val chave: String, val pacote: String, val titulo: String, val texto: String, val quando: Long, val simulada: Boolean)
    data class Decisao(val id: Long, val chave: String, val acao: String, val em: Long)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT NOT NULL UNIQUE, pacote TEXT NOT NULL, titulo TEXT NOT NULL, texto TEXT NOT NULL, quando INTEGER NOT NULL, simulada INTEGER NOT NULL DEFAULT 0)")
        criarVistas(db)
        criarDecisoes(db)
    }

    /** Botões dos avisos (Adicionar/Ignorar) tocados com o app fechado: o app aplica ao abrir. */
    private fun criarDecisoes(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS decisoes (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT NOT NULL, acao TEXT NOT NULL, em INTEGER NOT NULL)")
    }

    private fun criarVistas(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE vistas (chave TEXT PRIMARY KEY, base TEXT NOT NULL, em INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX vistas_base ON vistas (base, em)")
    }

    // Ao mudar o esquema: nunca apagar "vistas" (a memória evita reprocessar o que está na barra).
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) criarDecisoes(db)
    }

    // Garante a tabela de decisões em qualquer caso (ex.: banco de uma versão de teste).
    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        if (!db.isReadOnly) criarDecisoes(db)
    }

    /** Pacotes monitorados (definidos pelo app nos Ajustes). Fora desta lista nada é gravado. */
    fun pacotes(): Set<String> = prefs.getStringSet(PACOTES, null) ?: PACOTES_INICIAIS

    fun definirPacotes(p: Set<String>) {
        prefs.edit().putStringSet(PACOTES, HashSet(p)).apply()
    }

    private val prefs = ctx.getSharedPreferences("notificacoes", Context.MODE_PRIVATE)

    /**
     * Grava uma notificação, se for de app monitorado e ainda não vista.
     * @param id identidade da notificação no Android (sbn.key: pacote, id, tag); null = simulada.
     * @param quando horário da notificação (Notification.when), que distingue duas notificações iguais.
     * @return a chave, se entrou na fila; null se foi descartada ou repetida.
     */
    @Synchronized
    fun registrar(pacote: String, titulo: String, texto: String, quando: Long, id: String?): String? {
        if (pacote !in pacotes()) return null
        if (titulo.isBlank() && texto.isBlank()) return null
        val agora = System.currentTimeMillis()
        val base = if (id == null) "sim-" + UUID.randomUUID() else hash("$pacote|$id|$titulo|$texto")
        val chave = if (id == null) base else hash("$base|$quando")
        val db = writableDatabase
        db.beginTransaction()
        try {
            val vista = db.rawQuery(
                "SELECT 1 FROM vistas WHERE chave = ? OR (base = ? AND em > ?) LIMIT 1",
                arrayOf(chave, base, (agora - REPOST_MS).toString())
            ).use { it.moveToFirst() }
            if (vista) return null
            db.insertOrThrow("vistas", null, ContentValues().apply { put("chave", chave); put("base", base); put("em", agora) })
            db.insertOrThrow("fila", null, ContentValues().apply {
                put("chave", chave); put("pacote", pacote); put("titulo", titulo); put("texto", texto)
                put("quando", quando); put("simulada", if (id == null) 1 else 0)
            })
            db.delete("vistas", "em < ?", arrayOf((agora - TRINTA_DIAS).toString()))
            db.setTransactionSuccessful()
            return chave
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun listar(): List<Item> = readableDatabase.rawQuery(
        "SELECT id, chave, pacote, titulo, texto, quando, simulada FROM fila ORDER BY id", null
    ).use { c ->
        val out = ArrayList<Item>()
        while (c.moveToNext()) out.add(Item(c.getLong(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4), c.getLong(5), c.getInt(6) == 1))
        out
    }

    @Synchronized
    fun confirmar(ids: List<Long>) {
        if (ids.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (i in ids) db.delete("fila", "id = ?", arrayOf(i.toString()))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // ---- Decisões dos avisos ----

    @Synchronized
    fun registrarDecisao(chave: String, acao: String) {
        writableDatabase.insertOrThrow("decisoes", null, ContentValues().apply { put("chave", chave); put("acao", acao); put("em", System.currentTimeMillis()) })
    }

    @Synchronized
    fun listarDecisoes(): List<Decisao> = readableDatabase.rawQuery("SELECT id, chave, acao, em FROM decisoes ORDER BY id", null).use { c ->
        val out = ArrayList<Decisao>()
        while (c.moveToNext()) out.add(Decisao(c.getLong(0), c.getString(1), c.getString(2), c.getLong(3)))
        out
    }

    @Synchronized
    fun confirmarDecisoes(ids: List<Long>) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (i in ids) db.delete("decisoes", "id = ?", arrayOf(i.toString()))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    // ---- Regras (cópia enviada pelo app) para decidir o aviso com o app fechado ----

    private class RegraNativa(val pacote: String, val padrao: Pattern?, val acao: String)
    @Volatile private var cacheRegras: List<RegraNativa>? = null

    /**
     * Recebe do app as regras ativas já em ordem de prioridade, os nomes dos apps, o modo dos avisos
     * e o filtro que vale antes das regras ({exigirValor, palavras}).
     */
    fun definirRegras(regras: JSONArray, nomes: JSONObject, modo: String, filtro: JSONObject?) {
        val e = prefs.edit().putString(REGRAS, regras.toString()).putString(NOMES, nomes.toString()).putString(MODO, modo)
        if (filtro != null) e.putString(FILTRO, filtro.toString())
        e.apply()
        cacheRegras = null
        cacheFiltro = null
    }

    // ---- Filtro antes das regras (mesma lógica de filtrarNotif em src/core/regras.ts) ----

    private class FiltroNativo(val exigirValor: Boolean, val palavras: List<String>)
    @Volatile private var cacheFiltro: FiltroNativo? = null

    private fun filtro(): FiltroNativo = cacheFiltro ?: run {
        // Sem filtro enviado ainda (app não abriu depois de atualizar): o padrão do app.
        val o = try { JSONObject(prefs.getString(FILTRO, null) ?: "{}") } catch (_: Exception) { JSONObject() }
        val arr = o.optJSONArray("palavras")
        val palavras = if (arr == null) listOf("empréstimo") else (0 until arr.length()).map { arr.optString(it) }
        FiltroNativo(o.optBoolean("exigirValor", true), palavras.map { normalizar(it) }.filter { it.isNotEmpty() })
    }.also { cacheFiltro = it }

    /** true = ignorar antes das regras: tem uma palavra da lista, ou não fala de dinheiro ($ ou reais). */
    private fun filtrada(t: String): Boolean {
        val f = filtro()
        val n = " ${normalizar(t)} "
        if (f.palavras.any { n.contains(it) }) return true
        return f.exigirValor && !VALOR.containsMatchIn(t)
    }

    fun modoAvisos(): String = prefs.getString(MODO, null) ?: "sem-regra"

    fun nomeApp(pacote: String): String = try { JSONObject(prefs.getString(NOMES, "{}")!!).optString(pacote, pacote) } catch (_: Exception) { pacote }

    private fun regras(): List<RegraNativa> = cacheRegras ?: run {
        val arr = try { JSONArray(prefs.getString(REGRAS, "[]")) } catch (_: Exception) { JSONArray() }
        val out = ArrayList<RegraNativa>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            // Expressão que o Java não entende vale como "não casou" (o app decide ao abrir).
            val p = try { Pattern.compile(o.optString("padrao"), Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE) } catch (_: Exception) { null }
            out.add(RegraNativa(o.optString("pacote"), p, o.optString("acao")))
        }
        out.also { cacheRegras = it }
    }

    /** O que a primeira regra que casar faria: "ignorar", um tipo de transação, ou null (sem regra). */
    fun avaliar(pacote: String, titulo: String, texto: String): String? {
        val t = titulo.trim() + "\n" + texto.trim()
        if (filtrada(t)) return "ignorar"
        for (r in regras()) if (r.pacote == pacote && r.padrao?.matcher(t)?.find() == true) return r.acao
        return null
    }

    @Synchronized
    fun pendentes(): Long = readableDatabase.rawQuery("SELECT COUNT(*) FROM fila", null).use { it.moveToFirst(); it.getLong(0) }

    companion object {
        private const val PACOTES = "pacotes"
        private const val REGRAS = "regras"
        private const val NOMES = "nomes"
        private const val MODO = "modoAvisos"
        private const val FILTRO = "filtroNotif"
        private val VALOR = Regex("\\$|\\breais\\b", RegexOption.IGNORE_CASE)
        private val ACENTOS = Regex("\\p{Mn}+")
        private val NAO_ALFANUM = Regex("[^a-z0-9&]+")
        /** Igual a norm() do app: sem acento, minúsculas, só letras e números separados por espaço. */
        fun normalizar(s: String): String =
            NAO_ALFANUM.replace(ACENTOS.replace(Normalizer.normalize(s, Normalizer.Form.NFD), "").lowercase(), " ").trim()
        private const val TRINTA_DIAS = 30L * 24 * 60 * 60 * 1000
        /** Repostagem do mesmo id com o mesmo texto dentro deste intervalo é a mesma notificação. */
        private const val REPOST_MS = 2L * 60 * 1000
        /** Mesma lista inicial do app (src/core/padroes.ts), usada até o app abrir pela primeira vez. */
        val PACOTES_INICIAIS = setOf("com.mercadopago.wallet", "com.nu.production", "br.com.rico.mobile", "br.com.flashapp")

        @Volatile private var inst: Fila? = null
        fun de(ctx: Context): Fila = inst ?: synchronized(this) { inst ?: Fila(ctx.applicationContext).also { inst = it } }

        private fun hash(s: String): String =
            MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.substring(0, 32)
    }
}
