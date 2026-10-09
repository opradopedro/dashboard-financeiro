package app.dashboardfinanceiro.notificacoes

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.security.MessageDigest
import java.util.UUID

/**
 * Fila nativa persistente (SQLite) das notificações dos apps monitorados.
 *
 * - O serviço grava aqui mesmo com o app fechado; a gravação é síncrona, então nada se perde se o
 *   processo morrer logo depois.
 * - O lado web lê a fila ao abrir, guarda no próprio banco e só então confirma; só o que foi
 *   confirmado sai da fila. Se o app fechar no meio, os itens continuam aqui.
 * - A tabela "vistas" lembra as chaves por 30 dias: a mesma notificação repostada (atualização,
 *   reconexão do serviço) não entra de novo. O lado web também ignora chaves que já conhece.
 */
class Fila private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "fila_notificacoes.db", null, 1) {

    data class Item(val id: Long, val chave: String, val pacote: String, val titulo: String, val texto: String, val quando: Long, val simulada: Boolean)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE fila (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT NOT NULL UNIQUE, pacote TEXT NOT NULL, titulo TEXT NOT NULL, texto TEXT NOT NULL, quando INTEGER NOT NULL, simulada INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE TABLE vistas (chave TEXT PRIMARY KEY, em INTEGER NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    /** Pacotes monitorados (definidos pelo app nos Ajustes). Fora desta lista nada é gravado. */
    fun pacotes(): Set<String> = prefs.getStringSet(PACOTES, null) ?: PACOTES_INICIAIS

    fun definirPacotes(p: Set<String>) {
        prefs.edit().putStringSet(PACOTES, HashSet(p)).apply()
    }

    private val prefs = ctx.getSharedPreferences("notificacoes", Context.MODE_PRIVATE)

    /**
     * Grava uma notificação, se for de app monitorado e ainda não vista.
     * @param id identidade da notificação no Android (pacote, id, tag, momento); null = simulada.
     * @return true se entrou na fila.
     */
    @Synchronized
    fun registrar(pacote: String, titulo: String, texto: String, quando: Long, id: String?): Boolean {
        if (pacote !in pacotes()) return false
        if (titulo.isBlank() && texto.isBlank()) return false
        val chave = if (id == null) "sim-" + UUID.randomUUID() else hash("$pacote|$id|$titulo|$texto")
        val db = writableDatabase
        db.beginTransaction()
        try {
            val vista = db.rawQuery("SELECT 1 FROM vistas WHERE chave = ?", arrayOf(chave)).use { it.moveToFirst() }
            if (vista) return false
            db.insertOrThrow("vistas", null, ContentValues().apply { put("chave", chave); put("em", System.currentTimeMillis()) })
            db.insertOrThrow("fila", null, ContentValues().apply {
                put("chave", chave); put("pacote", pacote); put("titulo", titulo); put("texto", texto)
                put("quando", quando); put("simulada", if (id == null) 1 else 0)
            })
            db.delete("vistas", "em < ?", arrayOf((System.currentTimeMillis() - TRINTA_DIAS).toString()))
            db.setTransactionSuccessful()
            return true
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

    @Synchronized
    fun pendentes(): Long = readableDatabase.rawQuery("SELECT COUNT(*) FROM fila", null).use { it.moveToFirst(); it.getLong(0) }

    companion object {
        private const val PACOTES = "pacotes"
        private const val TRINTA_DIAS = 30L * 24 * 60 * 60 * 1000
        /** Mesma lista inicial do app (src/core/padroes.ts), usada até o app abrir pela primeira vez. */
        val PACOTES_INICIAIS = setOf("com.mercadopago.wallet", "com.nu.production", "br.com.rico.mobile")

        @Volatile private var inst: Fila? = null
        fun de(ctx: Context): Fila = inst ?: synchronized(this) { inst ?: Fila(ctx.applicationContext).also { inst = it } }

        private fun hash(s: String): String =
            MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.substring(0, 32)
    }
}
