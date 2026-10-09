package app.dashboardfinanceiro.notificacoes

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.dashboardfinanceiro.MainActivity
import app.dashboardfinanceiro.R

/**
 * Avisos do próprio app quando chega notificação de um app monitorado:
 * - sem regra: "Ignorar" (cria regra de ignorar pelo título) ou "Adicionar" (cria regra automática);
 * - já virou transação (modo "todas"): "Ignorar" desfaz a transação.
 * Os botões funcionam com o app fechado: a decisão fica guardada (Fila.decisoes) e é aplicada
 * na próxima vez que o app abrir. Tocar no aviso abre a notificação no app.
 */
object Avisos {
    private const val CANAL = "avisos"
    const val ACAO = "app.dashboardfinanceiro.AVISO_ACAO"
    const val EXTRA_CHAVE = "chave"
    const val EXTRA_ACAO = "acao"
    const val EXTRA_ROTA = "rota"

    fun id(chave: String) = chave.hashCode()

    private fun canal(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CANAL) != null) return
        nm.createNotificationChannel(NotificationChannel(CANAL, "Notificações capturadas", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Pergunta o que fazer com notificações dos apps monitorados que ainda não têm regra."
        })
    }

    /** Decide se avisa, conforme o modo escolhido no app e as regras atuais. */
    fun talvezAvisar(ctx: Context, chave: String, pacote: String, titulo: String, texto: String) {
        val fila = Fila.de(ctx)
        val modo = fila.modoAvisos()
        if (modo == "nunca") return
        val acao = fila.avaliar(pacote, titulo, texto)
        when {
            acao == null -> postar(ctx, chave, pacote, titulo, texto, true)
            acao != "ignorar" && modo == "todas" -> postar(ctx, chave, pacote, titulo, texto, false)
        }
    }

    private fun pendente(ctx: Context, chave: String, acao: String): PendingIntent {
        val i = Intent(ctx, AcaoReceiver::class.java).setAction(ACAO).putExtra(EXTRA_CHAVE, chave).putExtra(EXTRA_ACAO, acao)
        return PendingIntent.getBroadcast(ctx, (chave + acao).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun abrir(ctx: Context, chave: String): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).putExtra(EXTRA_ROTA, "notif/$chave")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(ctx, chave.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun postar(ctx: Context, chave: String, pacote: String, titulo: String, texto: String, semRegra: Boolean) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        canal(ctx)
        val app = Fila.de(ctx).nomeApp(pacote)
        val corpo = listOf(titulo.trim(), texto.trim()).filter { it.isNotEmpty() }.joinToString(" — ")
        val b = NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_stat_aviso)
            .setColor(0xFFD9B77E.toInt())
            .setContentTitle(app)
            .setSubText(if (semRegra) "sem regra" else "virou transação")
            .setContentText(corpo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(corpo + if (semRegra) "\n\nAdicionar cria uma regra para esta e as próximas parecidas." else ""))
            .setContentIntent(abrir(ctx, chave))
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .addAction(0, "Ignorar", pendente(ctx, chave, "ignorar"))
        if (semRegra) b.addAction(0, "Adicionar", pendente(ctx, chave, "adicionar"))
        try { NotificationManagerCompat.from(ctx).notify(id(chave), b.build()) } catch (_: SecurityException) { }
    }

    /** Troca o aviso por uma confirmação curta, que some sozinha. */
    fun confirmar(ctx: Context, chave: String, texto: String) {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return
        canal(ctx)
        val n = NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_stat_aviso)
            .setColor(0xFFD9B77E.toInt())
            .setContentTitle(texto)
            .setContentText("Entra no app na próxima vez que ele abrir.")
            .setContentIntent(abrir(ctx, chave))
            .setAutoCancel(true)
            .setSilent(true)
            .setTimeoutAfter(6000)
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id(chave), n) } catch (_: SecurityException) { }
    }

    fun cancelar(ctx: Context, chave: String) = NotificationManagerCompat.from(ctx).cancel(id(chave))
}
