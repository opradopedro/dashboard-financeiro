# CLAUDE.md — guia para as conversas de correção

App Android de controle financeiro pessoal (pt-BR). O dono do repositório **só usa o celular**: não
roda comandos nem compila. Toda verificação é feita aqui (testes) e pelo GitHub Actions; qualquer
passo manual dele precisa ser possível pelo navegador do celular, com passo a passo.

## Regras que não mudam

- **Nada de rede.** O app não faz chamadas de rede; o manifesto remove `INTERNET`
  (`tools:node="remove"`) e o workflow falha se o APK declarar essa permissão. A CSP do
  `index.html` só permite arquivos locais. Não adicione bibliotecas que busquem coisas online.
- **Nada pessoal no código.** Contas, apps monitorados, regras e categorias são dados editáveis,
  com valores iniciais em `src/core/padroes.ts`.
- **Interface em português do Brasil**, R$ (`Intl` pt-BR), datas **dd/mm/aaaa** (internamente
  `AAAA-MM-DD`), mobile-first, tema escuro.
- **finai-banco/1** é o formato do carteira (`opradopedro/carteira`, `src/banco/arquivo.ts`). Não
  invente campos: exportação em `src/core/finai.ts` com teste que fixa as chaves.
- **Mesma chave de assinatura para sempre** (secrets do repositório). A keystore nunca entra no git.
- Cada push gera Release nova; não apague Releases nem tags.

## Comandos

```bash
npm ci
npm test               # Vitest (tests/*.test.ts)
npm run typecheck      # tsc --noEmit
npx vite build         # dist/
npx cap sync android   # copia dist/ para android/app/src/main/assets/public (gitignored)
cd android && ./gradlew assembleRelease   # precisa de ANDROID_HOME (SDK 36) e JDK 21
```

No ambiente do Claude, o Maven Central às vezes devolve 429: repetir o Gradle (`--max-workers=1`)
até baixar tudo. A interface pode ser testada no navegador (`npx vite preview`) com Playwright:
`src/nativo/notificacoes.ts` tem uma imitação do plugin (fila em memória, mesmo filtro de pacotes).

## Arquitetura

```
src/
  core/            lógica pura, toda testada
    tipos.ts       modelos (Conta, Transacao, Notificacao, RegraNotif, Categoria, Dados…)
    padroes.ts     valores iniciais: contas, apps (pacotes), categorias, regras (CHUTE)
    util.ts        norm(), termoDe(), parseValor(), parseData(), datas
    classificar.ts tipo final + categoria (adaptado do carteira), resumoMes, serieMeses
    regras.ts      regra de notificação → transação (regex com grupos valor/desc/data)
    ingestao.ts    fila → registro → regras → transação; reprocessar
    juntar.ts      deduplicação de extrato, revisão, conferência mensal
    finai.ts       exportar/ler finai-banco/1
    backup.ts      backup/restauração e sanear() (valida dados do banco local e de backups)
  importar/        csv.ts, ofx.ts, planilha.ts (SheetJS, carregado sob demanda), mapear.ts, texto.ts
  dados/db.ts      IndexedDB: um registro 'dados' com tudo, gravado inteiro a cada mudança
  nativo/notificacoes.ts  ponte com o plugin Kotlin (+ imitação para navegador)
  app.ts           estado, mudar() (fila de gravações), consumirFila(), classificadas() com cache
  ui/              telas (strings HTML + eventos), nav.ts (rotas por hash), fmt.ts
  main.ts          tabela de telas, navegação por data-ir/data-aba, inicialização
android/           projeto Capacitor versionado
  app/src/main/java/app/dashboardfinanceiro/
    MainActivity.kt               registra o plugin
    notificacoes/Ouvinte.kt       NotificationListenerService (filtra pacote antes de ler)
    notificacoes/Fila.kt          SQLite: fila + chaves vistas (30 dias)
    notificacoes/NotificacoesPlugin.kt  estado, fila, simular, atalhos de configuração,
                                  salvarArquivo (ACTION_CREATE_DOCUMENT), botão voltar
.github/workflows/android.yml     testes → APK sem assinatura → apksigner → Release (+ espelho)
```

### Fluxo de uma notificação
1. `Ouvinte.onNotificationPosted` → se o pacote não está em `Fila.pacotes()`, retorna sem ler
   nada. Senão grava em `fila` (SQLite, síncrono) e avisa o plugin (`notificacao`).
2. O app (ao abrir, ao voltar para frente, ou no aviso) chama `consumirFila()`: `lerFila` →
   `receber()` (ignora chaves conhecidas e apps não monitorados) → grava no IndexedDB →
   `confirmar(ids)` apaga da fila nativa. Falha no meio = itens continuam na fila, sem duplicar.
3. `receber` cria a `Notificacao` (registro, com texto bruto) e chama `aplicarNotif`: regras do
   pacote por prioridade; `ignorar` → status ignorada; senão cria `Transacao` com origem
   notificação (ou liga a uma transação de extrato já existente).
4. O simulador chama `nativo.simular`, que usa o mesmo `Fila.registrar` (mesmo filtro).

A lista de pacotes monitorados é enviada ao nativo por `enviarPacotes()` ao abrir e ao editar apps.
Até o app abrir a primeira vez, vale `Fila.PACOTES_INICIAIS` (igual a `APPS_INICIAIS`).

### Transação e classificação
- `valor`: negativo = saiu/gastou (inclusive compra no cartão); positivo = entrou/estorno.
- `tipo` (da regra de notificação), `tipoUsuario` e `cat` (escolhas manuais) ficam na transação;
  o tipo/categoria **final** é calculado em `classificar()` (nunca gravado):
  `tipoUsuario` > regra de categoria > `tipo` da regra de notificação > `tipoAuto()` pela descrição.
  Depois junta pares (Pix entre contas suas = interna; débito na conta + crédito no cartão = fatura).
- Categoria: `cat` > regra de categoria > palavras-chave (trecho mais longo vence; entrada só em
  categoria de receita) > sem categoria (`''`, exibido “Sem categoria”).
- Painel conta só `entrada` e `saida`. Estorno no cartão = `saida` com valor positivo.

### Extratos e deduplicação (`juntar.ts`)
- Chave de linha: `id:<conta>:<FITID ou id>` ou `<conta>|<data>|<valor>|<desc normalizada>|<ordem>`.
- Linha com chave conhecida (em transação, em revisão ou em `excluidas`) = repetida.
- Candidatos: mesma conta, mesmo valor, sem extrato, até 3 dias. Um só e até 1 dia → une
  (extrato prevalece; origens guardam como cada fonte chegou). Senão, revisão. Nenhum → nova.

## Convenções

- TypeScript estrito, sem framework. Telas são funções `tela*(el, rota)` que montam HTML com
  `esc()` em todo texto vindo de dados e ligam eventos depois. Navegação: `data-ir="rota"`
  (empilha), `data-aba` (troca de aba), `trocar()` (substitui), `voltar()`.
- Telas com `vivo: true` em `main.ts` são refeitas quando os dados mudam; formulários não.
  Para refazer a tela atual depois de uma ação: `dispatchEvent(new Event('rerender'))`.
- Toda mudança de dados passa por `mudar(d => novoD)` (grava e notifica). Não mutar `state.dados`.
- Campos novos em `Dados`: adicionar em `tipos.ts`, `padroes.ts` (`dadosIniciais`) e `sanear()`
  em `backup.ts` (é ele que migra dados antigos). Teste de ida e volta em `tests/backup.test.ts`.
- Sintaxe compilada para `es2019`/`chrome74` (WebViews antigos de Android 7). Evite APIs novas
  sem checar suporte (ex.: `URLSearchParams.size`, `Array.prototype.at`).
- Comentários e mensagens em português, curtos.
- Testes Vitest para tudo em `src/core` e `src/importar`.

## Decisões (resumo; detalhes no README)

- appId `app.dashboardfinanceiro` — **não mudar** (mudaria o app instalado).
- Regras de notificação podem ser `ignorar` (ex.: investimentos da Rico).
- versionCode = segundos desde 01/01/2026; tag `v1.<run_number>` (`.<tentativa>` em re-execução).
- APK assinado no workflow com `apksigner` (v2+v3), chave EC P-256 em secrets:
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Espelho opcional: secret `BACKUP_REPO_TOKEN`, destino `vars.BACKUP_REPO` ou `<repo>-backup`.
- Backup automático do Android desligado (`allowBackup=false`, `data_extraction_rules.xml`).
- Botão voltar: o plugin emite `voltar`; `nav.voltar()` fecha diálogo, desempilha, volta ao Painel
  ou minimiza o app.

## Pendências conhecidas

- Regras iniciais de notificação são chute (sem textos reais); ajustar com o registro do usuário.
- Sem teste automatizado do lado Kotlin; a verificação é a compilação no workflow.
