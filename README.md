# Dashboard Financeiro

App Android de controle financeiro pessoal. Lê as notificações dos seus apps de banco (Mercado Pago,
Nubank, Rico e outros que você escolher), transforma em transações com regras editáveis, importa
extratos (CSV, Excel, OFX) sem duplicar e mostra entradas e saídas reais por mês e gastos por categoria.

- **Tudo fica no aparelho.** O app não faz nenhuma chamada de rede e nem declara a permissão de internet.
- Interface em português, valores em R$, datas dd/mm/aaaa, tema escuro.
- Funciona em qualquer Android 7.0 ou mais novo. Nada de dado pessoal no código: contas, apps
  monitorados, regras e categorias são configuráveis e vêm com valores iniciais.

---

## Instalar (pelo celular)

1. No navegador do celular, abra a página de **Releases** deste repositório
   (`github.com/<usuário>/dashboard-financeiro/releases`) e toque na mais recente.
2. Em **Assets**, toque em `dashboard-financeiro-vX.Y.apk` para baixar.
3. Abra o arquivo baixado. Se o Android pedir, permita **instalar apps desta fonte** (Chrome ou
   Arquivos) e volte.
4. Toque em **Instalar**. Se o Play Protect avisar sobre app desconhecido, toque em
   **Mais detalhes → Instalar assim mesmo** (é normal para APK fora da Play Store).

## Primeira vez: permissões

Ao abrir, o app mostra um guia (também em **Ajustes → Guia de permissões**):

1. **Acesso a notificações** — toque em *Abrir configuração* e ative *Dashboard Financeiro*.
   - **Android 13 ou mais novo:** apps instalados por APK caem em *configurações restritas* e a
     opção aparece cinza (ou surge o aviso “Configuração restrita”). Para liberar:
     *Abrir informações do app* → **⋮** (três pontinhos no canto de cima) → **Permitir
     configurações restritas** → confirme → volte e ative o acesso. Se o ⋮ não aparecer, tente
     ativar o acesso uma vez antes (o Android só mostra o menu depois de bloquear).
2. **Bateria** — toque em *Liberar bateria* e escolha *Permitir*. Em Xiaomi, Samsung e Motorola
   vale também: informações do app → Bateria → **Sem restrições**.

Em **Ajustes** aparece se o acesso está liberado, se o serviço está ativo e quantas notificações
estão esperando na fila.

## Como usar

### Painel
Entradas, saídas e saldo do mês, gastos por categoria, de onde veio o dinheiro, gráfico de 12 meses
e as contas. **Não contam** como entrada nem saída: caixinha/reserva, Pix e transferências entre
suas contas, e pagamento de fatura. Compra no crédito conta como gasto **na data da compra**.
Estorno no cartão desconta do gasto. Toque numa categoria para ver as transações e a média.

### Notificações
- O serviço guarda as notificações dos **apps monitorados** numa fila no próprio Android, mesmo
  com o app fechado. Ao abrir o app, elas entram, passam pelas regras e viram transações.
  Notificações de qualquer outro app são descartadas sem gravar nada.
- A aba **Notificações** é o registro: texto bruto, app, data/hora e status (*virou transação*,
  *ignorada*, *sem regra*, *erro na regra*). Toque numa para **criar regra a partir dela** ou
  **reprocessar**.
- **Simular notificação**: escolha o app, título e texto; ela entra pela mesma fila e regras das reais.

### Regras de notificação
Cada regra tem: app, padrão de texto (expressão regular), o que vira (entrada, saída,
transferência interna, pagamento de fatura, caixinha ou ignorar), se o dinheiro saiu ou entrou,
conta de destino, prioridade e ativa/desativada. A de maior prioridade que casar decide.

O padrão é testado contra **título + quebra de linha + texto**, ignorando maiúsculas. Grupos:

| Grupo | Para quê | Exemplo |
|---|---|---|
| `(?<valor>…)` | obrigatório | `R\$\s?(?<valor>[\d.]+,\d{2})` |
| `(?<desc>…)` | descrição (loja, pessoa) | `em (?<desc>.+?)\.` |
| `(?<data>…)` | opcional, dd/mm ou dd/mm/aaaa | `em (?<data>\d{2}/\d{2})` |

`[\s\S]*?` pula qualquer trecho. O editor tem **teste ao vivo** contra um texto e mostra com
quantas notificações já registradas a regra casaria. Depois de criar regras, use
*Reprocessar sem regra* na aba Notificações.

### Lançamento manual
Transações → **+ Lançar**. Toque em qualquer transação para editar data, descrição, valor, conta,
tipo e categoria, ou excluir. Marque *aplicar às parecidas* para o app aprender (cria uma regra de
categoria).

### Importar extratos
Aba **Importar**: escolha a conta e o arquivo (CSV, Excel .xlsx/.xls, OFX ou finai-banco/1 .json).
- CSV/Excel: confira o mapeamento de colunas na pré-visualização. Ele fica salvo como **modelo da
  conta** e é usado sozinho da próxima vez (mesmo cabeçalho). Fatura de cartão com compras
  positivas é detectada e o sinal é invertido (dá para mudar).
- **Sem duplicar:** reimportar o mesmo arquivo não cria nada. Linha do extrato que corresponde a
  uma transação de notificação ou manual (mesma conta, mesmo valor, data até 1 dia de diferença)
  é **unida** a ela: os dados do extrato prevalecem e a origem fica registrada. Se houver dúvida
  (mais de um candidato, ou 2–3 dias de diferença), a linha vai para **Revisão**.
- **Conferência mensal** (por conta): o que bateu, o que só está no extrato e o que só veio por
  notificação/manual.

### Categorias
Categorização automática por palavras-chave (editáveis em Ajustes → Categorias; vence o trecho mais
longo; `*` no fim = começo de palavra) e por regras criadas ao corrigir transações. O que ficou sem
categoria aparece no painel (“Ver N sem categoria”).

### Dados
Ajustes → Backup, restauração e exportação:
- **Salvar backup** (tudo num .json, você escolhe onde salvar) e **Restaurar** (substitui tudo).
- **Exportar finai-banco/1**: contas e transações no formato do app *carteira*.
- O Android não faz backup automático na nuvem dos dados deste app (desligado de propósito).

## Como atualizar

Baixe o APK da Release mais nova e instale **por cima** (sem desinstalar). Como toda versão é
assinada com a mesma chave, os dados continuam. Nunca desinstale antes, ou os dados somem — e
faça um backup de vez em quando.

---

## Build e publicação (GitHub Actions)

O workflow `.github/workflows/android.yml` roda em **push para qualquer branch** e pelo botão
**Actions → Android → Run workflow** (escolha o branch). Ele:

1. roda typecheck e testes (Vitest);
2. faz o build da interface (Vite) e copia para o projeto Android (Capacitor);
3. compila o APK de release e confere que ele **não** declara a permissão INTERNET;
4. assina com a sua chave (secrets) e publica uma **Release nova** com tag própria
   (`v1.<número da execução>`), notas com os commits desde a versão anterior e o APK.
   O versionCode é sempre maior que o anterior. Nenhuma Release antiga é apagada.
5. (opcional) copia o APK para o repositório `<este repositório>-backup` como Release.

Sem os secrets de assinatura, o passo **Assinar e publicar** falha com a mensagem
“Faltam secrets de assinatura” (os testes e a compilação continuam sendo verificados).

### Assinatura: cadastrar os secrets pelo celular

Os valores são entregues uma única vez, fora do repositório (a chave nunca é versionada). Guarde-os
num lugar seguro (gerenciador de senhas, Google Drive): **sem a mesma chave, as próximas versões não
instalam por cima** e seria preciso desinstalar (perdendo os dados).

1. No navegador do celular, abra o repositório no GitHub. Se não aparecer **Settings**, toque nos
   **⋯** ou use “Versão para computador” no menu do navegador.
2. **Settings → Secrets and variables → Actions → New repository secret**.
3. Crie os quatro (nome exatamente assim, valor colado sem espaços nem quebras de linha):
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
4. Vá em **Actions → Android → Run workflow** (escolha o branch) para gerar a primeira Release.

### Espelho opcional dos APKs

1. Crie o repositório `dashboard-financeiro-backup` (pode ser privado) **com um README**
   (precisa de pelo menos um commit).
2. Crie um token *fine-grained* (GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained) com acesso só a esse repositório e permissão **Contents: Read and write**.
3. Cadastre-o como secret `BACKUP_REPO_TOKEN` neste repositório. Para usar outro repositório de
   destino, crie a *variable* `BACKUP_REPO` (ex.: `usuario/outro-repo`).

Sem o secret, o espelho é pulado sem falhar. Se falhar com o secret, aparece um aviso e a Release
principal continua publicada.

### Se o workflow ficar vermelho
Abra **Actions**, toque na execução vermelha, depois no passo com ❌, e copie as últimas linhas do
log (ou tire print) para mandar numa conversa de correção.

## Desenvolvimento (computador)

```bash
npm ci
npm test            # Vitest
npm run typecheck
npm run dev         # interface no navegador (com uma imitação do serviço de notificações)
npx vite build && npx cap sync android && (cd android && ./gradlew assembleRelease)
```

Stack: Vite + TypeScript sem framework, Capacitor 8 (Android), Vitest, plugin Capacitor local em
Kotlin. minSdk 24 (Android 7.0), targetSdk 36. Detalhes de arquitetura em `CLAUDE.md`.

---

## Decisões tomadas

- **Reaproveitamento do carteira** (`opradopedro/carteira`, branch `ccr-df4ff5f2-5xh621`, igual ao
  `main`, commit `740db74`): classificação (`src/banco/classificar.ts` → `src/core/classificar.ts`),
  painéis e gráfico SVG (`src/ui/banco.ts` → `src/ui/painel.ts`) e o formato
  `finai-banco/1` (`src/banco/arquivo.ts` → `src/core/finai.ts`).
- **Tipos de transação:** entrada, saída, transferência interna, pagamento de fatura e
  caixinha/reserva. “Investimento” do carteira virou caixinha/reserva (também não conta).
- **Pacotes** conferidos na Google Play: `com.mercadopago.wallet` (Mercado Libre),
  `com.nu.production` (Nu), `br.com.rico.mobile` (RICO.COM.VC).
- **Rico:** uma regra de prioridade alta *ignora* notificações de investimento (aplicação,
  resgate, dividendos, CDB, Tesouro, ordens…); só compras do cartão viram transação. Nada de
  investimento da Rico entra no app.
- **Regras podem “ignorar”** (além dos cinco tipos), para descartar de propósito notificações de
  um app monitorado.
- **Identificadores das contas iniciais** iguais aos da rotina do carteira (`mercadopago-conta`,
  `mercadopago-cartao`, `nubank-cartao`, `rico-cartao`), para a exportação casar com ele.
- **Exportação finai-banco/1:** só os campos do formato (`formato`, `geradoEm`, `contas[id, banco,
  nome, tipo, saldo]`, `transacoes[conta, data, descricao, valor, id]`). O `id` opcional é o da
  transação no app (o leitor do carteira usa para não duplicar). `saldo` = saldo informado na conta
  + transações seguintes; sem saldo informado, `0`. Também dá para **importar** arquivos nesse formato.
- **Deduplicação:** une sozinho só com exatamente um candidato até 1 dia; 2–3 dias ou mais de um
  candidato vai para Revisão. Transação excluída que veio de extrato não volta ao reimportar.
- **Fila nativa em SQLite** com confirmação: o Android só apaga o item depois que o app gravou no
  banco local. Chave de cada notificação = hash de (pacote, id da notificação, título, texto,
  horário); a mesma notificação não entra de novo (memória de 30 dias no Android, e o app também
  ignora chaves que já conhece). Se um app repostar a mesma notificação (mesmo id e mesmo texto)
  em até 2 minutos, conta como uma só. Resumos de grupo são ignorados.
- **Sem internet:** permissão INTERNET removida do manifesto, Content-Security-Policy só com
  arquivos locais, backup automático do Android desligado.
- **Salvar arquivos** (backup/exportação) pelo seletor do Android (“Salvar como”), sem pedir
  permissão de armazenamento.
- **versionCode** = segundos desde 01/01/2026 (sempre cresce, inclusive entre branches);
  versionName/tag = `1.<número da execução>`.
- **Chave de assinatura EC P-256** (base64 curto para colar no celular), validade de 100 anos.
- APK assinado com `apksigner` no workflow (a chave nunca passa pelo Gradle nem pelo repositório).

## O que é chute ou está pendente

- **Regras iniciais das notificações** (Mercado Pago, Nubank, Rico): escritas sem ver notificações
  reais. Ajuste com o editor e o teste ao vivo usando o registro.
- **Palavras-chave das categorias**: lista genérica vinda do carteira.
- **Fabricantes agressivos com bateria** (Xiaomi/MIUI, alguns Samsung) podem parar o serviço
  mesmo com a bateria liberada; nesse caso o Android religa quando possível e o que estiver na
  barra de notificações é recuperado, mas notificações dispensadas enquanto o serviço estava
  parado não são.
- Não há leitura de saldo real das contas: o saldo é estimado a partir de um valor que você informa.
