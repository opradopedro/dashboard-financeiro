package app.dashboardfinanceiro.notificacoes

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * Ponte entre o app (web) e o Android: estado do acesso a notificações, fila nativa, simulação,
 * atalhos para as telas de permissão, salvar arquivo (backup/exportação) e botão voltar.
 */
@CapacitorPlugin(
    name = "Notificacoes",
    permissions = [Permission(alias = "avisos", strings = [Manifest.permission.POST_NOTIFICATIONS])]
)
class NotificacoesPlugin : Plugin() {

    /** Tela pedida ao tocar num aviso (o app navega para ela ao abrir). */
    private var rotaPendente: String? = null

    override fun load() {
        instancia = WeakReference(this)
        rotaPendente = activity.intent?.getStringExtra(Avisos.EXTRA_ROTA)
        activity.intent?.removeExtra(Avisos.EXTRA_ROTA)
        // Botão voltar do Android: o app decide (fechar janela, voltar de tela ou sair).
        activity.runOnUiThread {
            activity.onBackPressedDispatcher.addCallback(activity, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (hasListeners("voltar")) notifyListeners("voltar", JSObject())
                    else if (bridge.webView.canGoBack()) bridge.webView.goBack()
                    else activity.moveTaskToBack(true)
                }
            })
        }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        notifyListeners("retomou", JSObject())
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        val rota = intent.getStringExtra(Avisos.EXTRA_ROTA) ?: return
        intent.removeExtra(Avisos.EXTRA_ROTA)
        notifyListeners("abrir", JSObject().apply { put("rota", rota) })
    }

    @PluginMethod
    fun rotaInicial(call: PluginCall) {
        val r = rotaPendente
        rotaPendente = null
        call.resolve(JSObject().apply { put("rota", r ?: "") })
    }

    private fun fila() = Fila.de(context)

    @PluginMethod
    fun estado(call: PluginCall) {
        try {
            val pm = context.getSystemService(PowerManager::class.java)
            call.resolve(JSObject().apply {
                put("acessoPermitido", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName))
                put("servicoConectado", Ouvinte.conectado)
                put("bateriaLiberada", pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false)
                put("android", Build.VERSION.SDK_INT)
                put("fabricante", Build.MANUFACTURER ?: "")
                put("pendentes", fila().pendentes())
                put("pacotes", JSArray(fila().pacotes().sorted()))
                put("avisosPermitidos", NotificationManagerCompat.from(context).areNotificationsEnabled())
            })
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    /** Regras ativas (em ordem de prioridade), nomes dos apps e modo dos avisos, para decidir o aviso com o app fechado. */
    @PluginMethod
    fun definirRegras(call: PluginCall) {
        try {
            val regras = call.getArray("regras") ?: return call.reject("Faltou a lista de regras.")
            fila().definirRegras(regras, call.getObject("nomes") ?: JSONObject(), call.getString("modo") ?: "sem-regra", call.getObject("filtro"))
            call.resolve()
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    @PluginMethod
    fun lerDecisoes(call: PluginCall) {
        try {
            val itens = JSArray()
            for (d in fila().listarDecisoes()) itens.put(JSObject().apply { put("id", d.id); put("chave", d.chave); put("acao", d.acao); put("em", d.em) })
            call.resolve(JSObject().apply { put("itens", itens) })
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    @PluginMethod
    fun confirmarDecisoes(call: PluginCall) {
        try {
            val arr = call.getArray("ids") ?: return call.reject("Faltou a lista de ids.")
            fila().confirmarDecisoes((0 until arr.length()).map { arr.getLong(it) })
            call.resolve()
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    @PluginMethod
    fun cancelarAvisos(call: PluginCall) {
        try {
            val arr = call.getArray("chaves") ?: return call.reject("Faltou a lista de chaves.")
            for (i in 0 until arr.length()) Avisos.cancelar(context, arr.getString(i))
            call.resolve()
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    /** Android 13+: pede a permissão de mostrar notificações. Antes disso, já vem liberada. */
    @PluginMethod
    fun pedirPermissaoAvisos(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            return call.resolve(JSObject().apply { put("permitido", NotificationManagerCompat.from(context).areNotificationsEnabled()) })
        }
        requestPermissionForAlias("avisos", call, "aoPermitirAvisos")
    }

    @PermissionCallback
    private fun aoPermitirAvisos(call: PluginCall) {
        call.resolve(JSObject().apply { put("permitido", NotificationManagerCompat.from(context).areNotificationsEnabled()) })
    }

    @PluginMethod
    fun abrirConfigAvisos(call: PluginCall) {
        val i = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))
        abrir(call, i, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)))
    }

    @PluginMethod
    fun definirPacotes(call: PluginCall) {
        try {
            val arr = call.getArray("pacotes") ?: return call.reject("Faltou a lista de pacotes.")
            val set = HashSet<String>()
            for (i in 0 until arr.length()) arr.optString(i)?.trim()?.takeIf { it.isNotEmpty() }?.let { set.add(it) }
            fila().definirPacotes(set)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    @PluginMethod
    fun lerFila(call: PluginCall) {
        try {
            val itens = JSArray()
            for (it in fila().listar()) itens.put(JSObject().apply {
                put("id", it.id); put("chave", it.chave); put("pacote", it.pacote); put("titulo", it.titulo)
                put("texto", it.texto); put("quando", it.quando); put("simulada", it.simulada)
            })
            call.resolve(JSObject().apply { put("itens", itens) })
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    @PluginMethod
    fun confirmar(call: PluginCall) {
        try {
            val arr = call.getArray("ids") ?: return call.reject("Faltou a lista de ids.")
            fila().confirmar((0 until arr.length()).map { arr.getLong(it) })
            call.resolve()
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    /** Simulação: entra pela mesma porta das notificações reais (filtro de pacote e fila). */
    @PluginMethod
    fun simular(call: PluginCall) {
        try {
            val pacote = call.getString("pacote")?.trim().orEmpty()
            val titulo = call.getString("titulo").orEmpty()
            val texto = call.getString("texto").orEmpty()
            val chave = fila().registrar(pacote, titulo, texto, System.currentTimeMillis(), null)
            if (chave != null) {
                avisarNova()
                Avisos.talvezAvisar(context, chave, pacote, titulo, texto)
            }
            call.resolve(JSObject().apply { put("aceita", chave != null); put("chave", chave ?: "") })
        } catch (e: Exception) {
            call.reject("Falha no Android: ${e.message}")
        }
    }

    @PluginMethod
    fun abrirAcessoNotificacoes(call: PluginCall) {
        val comp = ComponentName(context, Ouvinte::class.java)
        val detalhe = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, comp.flattenToString())
        else null
        abrir(call, detalhe, Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    @PluginMethod
    fun abrirInfoApp(call: PluginCall) {
        abrir(call, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)), Intent(Settings.ACTION_SETTINGS))
    }

    @PluginMethod
    fun pedirBateria(call: PluginCall) {
        abrir(call, Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName)),
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    @PluginMethod
    fun religar(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) NotificationListenerService.requestRebind(ComponentName(context, Ouvinte::class.java))
        call.resolve()
    }

    @PluginMethod
    fun sair(call: PluginCall) {
        activity.moveTaskToBack(true)
        call.resolve()
    }

    private fun abrir(call: PluginCall, vararg intents: Intent?) {
        for (i in intents) {
            if (i == null) continue
            try {
                activity.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return call.resolve()
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        call.reject("Não consegui abrir a tela de configurações.")
    }

    // ---- Salvar arquivo (backup e exportação): você escolhe onde, sem pedir permissão de armazenamento.

    @PluginMethod
    fun salvarArquivo(call: PluginCall) {
        val nome = call.getString("nome") ?: return call.reject("Faltou o nome do arquivo.")
        if (call.getString("conteudo") == null) return call.reject("Faltou o conteúdo.")
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = call.getString("mime") ?: "application/json"
            putExtra(Intent.EXTRA_TITLE, nome)
        }
        startActivityForResult(call, intent, "aoSalvar")
    }

    @ActivityCallback
    private fun aoSalvar(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != android.app.Activity.RESULT_OK || uri == null) {
            return call.resolve(JSObject().apply { put("salvo", false) })
        }
        try {
            context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(call.getString("conteudo")!!.toByteArray(Charsets.UTF_8)) }
                ?: return call.reject("Não consegui abrir o arquivo para gravar.")
            call.resolve(JSObject().apply { put("salvo", true) })
        } catch (e: Exception) {
            call.reject("Falha ao gravar o arquivo: ${e.message}")
        }
    }

    companion object {
        @Volatile private var instancia: WeakReference<NotificacoesPlugin>? = null

        /** Chamado pelo serviço quando entra algo na fila: com o app aberto, ele processa na hora. */
        fun avisarNova() {
            val p = instancia?.get() ?: return
            Handler(Looper.getMainLooper()).post { p.notifyListeners("notificacao", JSObject()) }
        }
    }
}
