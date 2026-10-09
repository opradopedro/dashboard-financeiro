package app.dashboardfinanceiro.notificacoes

import android.app.Notification
import android.content.ComponentName
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Serviço de acesso a notificações. Roda com o app fechado (o Android o mantém enquanto o acesso
 * estiver liberado). Notificações de apps fora da lista monitorada são descartadas na hora, sem
 * ler o conteúdo nem gravar nada.
 */
class Ouvinte : NotificationListenerService() {

    override fun onListenerConnected() {
        conectado = true
        // O que chegou enquanto o serviço estava desligado e ainda está na barra: a fila descarta repetidas.
        try { activeNotifications?.forEach { guardar(it) } } catch (e: Exception) { Log.w(TAG, "activeNotifications", e) }
    }

    override fun onListenerDisconnected() {
        conectado = false
        // Pede para o Android religar o serviço (ex.: depois de o sistema matá-lo).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) requestRebind(ComponentName(this, Ouvinte::class.java))
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn != null) guardar(sbn)
    }

    private fun guardar(sbn: StatusBarNotification) {
        try {
            val fila = Fila.de(this)
            if (sbn.packageName !in fila.pacotes()) return
            val n = sbn.notification ?: return
            if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return // resumo do grupo repete as outras
            val ex = n.extras
            val titulo = (ex.getCharSequence(Notification.EXTRA_TITLE_BIG) ?: ex.getCharSequence(Notification.EXTRA_TITLE))?.toString()?.trim() ?: ""
            val linhas = ex.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n") { it.toString() }
            val texto = (ex.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: linhas ?: ex.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: "").trim()
            val quando = if (n.`when` > 0) n.`when` else sbn.postTime
            // Identidade: a mesma notificação repostada tem a mesma chave, id e "when".
            if (fila.registrar(sbn.packageName, titulo, texto, quando, "${sbn.key}|${n.`when`}")) NotificacoesPlugin.avisarNova()
        } catch (e: Exception) {
            Log.e(TAG, "falha ao guardar notificação", e)
        }
    }

    companion object {
        private const val TAG = "Ouvinte"
        @Volatile var conectado = false
    }
}
