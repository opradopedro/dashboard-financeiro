package app.dashboardfinanceiro.notificacoes

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Recebe o toque em "Ignorar"/"Adicionar" do aviso, mesmo com o app fechado. */
class AcaoReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Avisos.ACAO) return
        val chave = intent.getStringExtra(Avisos.EXTRA_CHAVE) ?: return
        val acao = intent.getStringExtra(Avisos.EXTRA_ACAO)?.takeIf { it == "adicionar" || it == "ignorar" } ?: return
        Fila.de(ctx).registrarDecisao(chave, acao)
        Avisos.confirmar(ctx, chave, if (acao == "adicionar") "✓ Regra será criada" else "✓ Ignorada")
        NotificacoesPlugin.avisarNova()
    }
}
