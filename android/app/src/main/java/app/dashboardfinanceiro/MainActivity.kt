package app.dashboardfinanceiro

import android.os.Bundle
import app.dashboardfinanceiro.notificacoes.NotificacoesPlugin
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Plugin local (Kotlin): precisa ser registrado antes do super.onCreate.
        registerPlugin(NotificacoesPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
