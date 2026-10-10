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
- **Versões acumuladas.** Push comum NÃO gera Release (o workflow só testa e compila). Cada mudança
  pedida entra como item em `proxima` de `src/novidades.json` (frase curta, do ponto de vista de
  quem usa). Só quando o dono pedir "atualizar a versão do APK":
  1. mover os itens de `proxima` para uma entrada nova no topo de `versoes`
     (`versao` = anterior + 0.1, ex.: 1.7 → 1.8; `data` = hoje AAAA-MM-DD) e deixar `proxima: []`;
  2. commit com `[versao]` no **título** (primeira linha), push, acompanhar o workflow até a
     Release `v<versão>`. Fora disso, nunca escrever essa marca no título de um commit;
  3. responder no chat com o link da Release e a lista do que mudou (os mesmos itens).
  O app mostra o histórico em Ajustes → Novidades. Não apague Releases nem tags.

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
    indicadores.ts forma de pagamento, gasto por conta, ritmo do mês, dias da semana, maiores, lugares
    regras.ts      regra de notificação → transação (regex com grupos valor/desc/data)
    automatica.ts  botões Adicionar/Ignorar: gerarRegraAuto, gerarRegraIgnorar, aplicarDecisoes
    migracoes.ts   versões dos dados (v2: Flash, regras reais); regras-v1.json = regras padrão da v1
    ingestao.ts    fila → registro → regras → transação; reprocessar
    juntar.ts      deduplicação de extrato, revisão, conferência mensal
    duplicadas.ts  avisos antes de gravar: importação repetida, linhas iguais de outro extrato, tx igual
    filtros.ts     filtro do Painel (contas, formas, categorias): juntarFiltros (união por campo), filtrar
    finai.ts       exportar/ler finai-banco/1
    backup.ts      backup/restauração e sanear() (valida dados do banco local e de backups)
  importar/        detectar.ts (banco/conta do arquivo: modelo salvo > formato > nome), csv.ts, ofx.ts, pdf.ts (pdf.js; tabela Data/Descrição/ID/Valor/Saldo), planilha.ts
                   (SheetJS sob demanda), mapear.ts (inclui saldo e parcela), texto.ts
  dados/db.ts      IndexedDB: um registro 'dados' com tudo, gravado inteiro a cada mudança
  nativo/notificacoes.ts  ponte com o plugin Kotlin (+ imitação para navegador)
  app.ts           estado, mudar() (fila de gravações), consumirFila(), classificadas() com cache
  ui/              telas (strings HTML + eventos), nav.ts (rotas por hash), fmt.ts, graficos.ts (SVG),
                   escolher.ts (folhas: categoria com busca, opção, confirmar), datas.ts, filtro.ts (filtro em uso na memória,
                   clsFiltradas, folha, Filtros salvos), novidades.ts
  novidades.json   histórico de versões + `proxima` (pendentes); gera as notas da Release
  main.ts          tabela de telas, navegação por data-ir/data-aba, inicialização
android/           projeto Capacitor versionado
  app/src/main/java/app/dashboardfinanceiro/
    MainActivity.kt               registra o plugin
    notificacoes/Ouvinte.kt       NotificationListenerService (filtra pacote antes de ler)
    notificacoes/Fila.kt          SQLite: fila + chaves vistas (30 dias; repost igual em 2 min = mesma)
    notificacoes/NotificacoesPlugin.kt  estado, fila, decisões, regras, simular, atalhos de
                                  configuração, permissão de avisos, salvarArquivo, voltar, rota
    notificacoes/Avisos.kt        aviso do app com Ignorar/Adicionar (canal "avisos")
    notificacoes/AcaoReceiver.kt  toque nos botões (app fechado) → Fila.decisoes
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
5. Avisos: depois de gravar, `Avisos.talvezAvisar` testa a cópia das regras (Java regex, enviada
   por `sincronizarNativo()`); sem regra → aviso com Ignorar/Adicionar. O toque grava em
   `decisoes`; `consumirFila()` lê as decisões depois da fila e chama `aplicarDecisoes`.
   Tocar no aviso abre `#/notif/<chave>` (extra "rota" → `rotaInicial()` ou evento `abrir`).
   Regex do usuário que o Java não compila conta como "sem regra" só para o aviso.

A lista de pacotes monitorados é enviada ao nativo por `enviarPacotes()` ao abrir e ao editar apps.
Até o app abrir a primeira vez, vale `Fila.PACOTES_INICIAIS` (igual a `APPS_INICIAIS`).

### Transação e classificação
- `valor`: negativo = saiu/gastou (inclusive compra no cartão); positivo = entrou/estorno.
- `tipo` (da regra de notificação), `tipoUsuario` e `cat` (escolhas manuais) ficam na transação;
  o tipo/categoria **final** é calculado em `classificar()` (nunca gravado):
  `tipoUsuario` > regra de categoria > `tipo` da regra de notificação > `tipoAuto()` pela descrição.
  Depois junta pares, com `par` apontando a outra ponta: Pix entre contas suas = interna (±3 dias);
  pagamento no cartão (só tipo fatura: FATURA em qualquer sinal, regra ou escolha; crédito comum no
  cartão é estorno) + saída de conta que não é vale (`ehContaVale`) de
  mesmo valor, de 10 dias antes a 5 depois = fatura (prefere a que cita o banco do cartão); sem valor
  igual, valor sem centavos a até R$ 5 ou 1% (o dono costuma mandar a fatura arredondada em reais:
  1.118,30 → 1.118/1.119/1.120); por último, até 15% ou R$ 50 se a saída tem o nome do titular ou
  cita o banco (`APELIDOS`). Os aproximados exigem fatura >= R$ 50 e saída com cara de pagamento
  (`PAGAVEL`: Pix, transferência, boleto…). A sobra fica na conta do banco. `mesDaFatura(data)` =
  mês de 15 dias antes do pagamento (pago dia 5 = fatura do mês anterior); o Painel mostra as faturas
  nesse mês.
- Categoria: `cat` > regra de categoria > palavras-chave (trecho mais longo vence; entrada só em
  categoria de receita) > sem categoria (`''`, exibido “Sem categoria”).
- Painel conta só `entrada` e `saida`. Estorno no cartão = `saida` com valor positivo.

### Extratos e deduplicação (`juntar.ts`)
- Pré-visualização: `Edicoes` por índice da linha (excluir/inverter/cat/tipo); `aplicarEdicoes` mantém a
  chave da linha original e manda as tiradas para `excluidas`. `txsDaImportacao` acha as transações de
  um arquivo (origem extrato com mesmo `em` e arquivo). `desfazerImportacoes` remove importações
  (txs só delas saem; unidas voltam à primeira origem restante; sem marcar excluídas). Em cartão, o sinal é orientado sozinho
  (maioria positiva = trocado), mesmo com modelo salvo.
- Importação aceita vários arquivos: `detectarFonte` (modelo salvo > cabeçalho/PDF/OFX > nome do
  arquivo) e `contaDaFonte` (mesmo banco e tipo) escolhem a conta; em lote o modelo é sempre salvo.
- Chave de linha: `id:<conta>:<FITID ou id>` ou `<conta>|<data>|<valor>|<desc normalizada>|<ordem>`.
- Linha com chave conhecida (em transação, em revisão ou em `excluidas`) = repetida.
- Candidatos: mesma conta, mesmo valor, sem extrato, até 3 dias. Um só e até 1 dia → une
  (extrato prevalece; origens guardam como cada fonte chegou). Senão, revisão. Nenhum → nova.

## Visual

“Caderno-caixa noturno” (plano feito com a skill frontend-design). Tokens em `src/style.css`:
noite #0E1420, lousa #161E2D, papel #E9EDF3, grafite #8E9AB0, champanhe #D9C8A4 (ações);
dados: entrada #3B97C9, saída #CF7448 (validadas para daltonismo; verde/vermelho reprova).
Fontes embutidas: Montserrat Alternates (títulos, nome do mês) e Montserrat variável (texto,
números 300 tabulares). Evitar: rótulos em CAIXA ALTA, “·” como separador, “›”/“→” em botões,
cartões iguais para tudo. A peça marcante é o topo do Painel (mês grande + frase + fita dupla).

## Convenções

- TypeScript estrito, sem framework. Telas são funções `tela*(el, rota)` que montam HTML com
  `esc()` em todo texto vindo de dados e ligam eventos depois. Navegação: `data-ir="rota"`
  (empilha), `data-aba` (troca de aba), `trocar()` (substitui), `voltar()`.
- Listas: use `<select>` normal com `<label for>`; `ativarSelects()` (escolher.ts) abre a folha do
  app no lugar da lista do Android (o CSS deixa o select sem toque; o clique é achado pela posição)
  e devolve a escolha com evento `change`. Mais de 8 opções = folha com busca.
- Datas: use `<input type="date">` com `<label for>`; `ativarDatas()` (datas.ts) troca por campo
  dd/mm/aaaa + calendário do app e deixa o original escondido (mesmo id, valor AAAA-MM-DD).
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
- Regras de notificação podem ser `ignorar` (ex.: investimentos da Rico). Têm `origem`
  (padrao, manual, notificacao, automatica) e `criadaEm`.
- Formatos reais conferidos: PDF Mercado Pago, fatura Rico CSV, fatura Nubank CSV, extrato Flash CSV
  (testes em `tests/extratos-reais.test.ts`, com dados trocados; nunca versionar arquivos do usuário).
- versionCode = segundos desde 01/01/2026; tag `v<versão de novidades.json>` (pelo botão, se já
  existe, `v<versão>.<run_number>`); builds sem Release usam `<versão>-teste.<run_number>`.
- APK assinado no workflow com `apksigner` (v2+v3), chave EC P-256 em secrets:
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Espelho opcional: secret `BACKUP_REPO_TOKEN`, destino `vars.BACKUP_REPO` ou `<repo>-backup`.
- Backup automático do Android desligado (`allowBackup=false`, `data_extraction_rules.xml`).
- Botão voltar: o plugin emite `voltar`; `nav.voltar()` fecha diálogo, desempilha, volta ao Painel
  ou minimiza o app.

## Pendências conhecidas

- Regras iniciais de notificação são chute (sem textos reais); ajustar com o registro do usuário.
- Sem teste automatizado do lado Kotlin; a verificação é a compilação no workflow. Na primeira
  entrega, captura real, fila com app em segundo plano, repost, permissões e voltar foram testados
  num emulador Android 11 (sem aceleração, `cmd notification post` com `com.android.shell` monitorado).
