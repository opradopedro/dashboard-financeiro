# Dashboard Financeiro

App Android de controle financeiro pessoal. Lê as notificações dos seus apps de banco (Mercado Pago,
Nubank, Rico, Flash e outros que você escolher), transforma em transações com regras editáveis,
importa extratos e faturas (PDF do Mercado Pago, CSV, Excel, OFX) sem duplicar e mostra entradas e
saídas reais por mês e gastos por categoria.

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
2. **Avisos do app** — toque em *Permitir avisos* (Android 13 ou mais novo pergunta; nos mais
   antigos já vem liberado). É o que mostra os botões Ignorar e Adicionar.
3. **Bateria** — toque em *Liberar bateria* e escolha *Permitir*. Em Xiaomi, Samsung e Motorola
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
- **Propagandas e avisos que não são compra** (cashback, novidades, limite) também ficam no
  registro, como *sem regra*, mas **não viram transação**.

### Avisos com Ignorar e Adicionar
Quando chega uma notificação de app monitorado que **ainda não tem regra**, o app mostra um aviso
dele com dois botões, que funcionam com o app fechado:
- **Adicionar**: cria sozinho uma regra a partir do texto (o valor em R$, o nome da loja ou da
  pessoa, entrada ou saída e a conta do banco) e transforma esta e as próximas parecidas em
  transação.
- **Ignorar**: cria uma regra que ignora as próximas com o **mesmo título**. É assim que as
  propagandas param de perguntar.

O toque fica guardado no Android e é aplicado na próxima vez que o app abrir (o aviso mostra
“Regra será criada”). Tocar no aviso abre a notificação no app, onde também há os dois botões.
Em **Ajustes → Avisos** dá para escolher: só as sem regra (padrão), todas (nas que viraram
transação, Ignorar desfaz) ou nunca.

### Regras
Ajustes → **Regras** mostra todas as regras de notificação e de categoria. Dá para **ordenar** por
app, mais recentes ou mais antigas, e **filtrar pela origem**: vieram com o app, criadas por você,
a partir de notificação (botão *Criar regra à mão*) ou automáticas (botões dos avisos).

Cada regra de notificação tem: app, padrão de texto (expressão regular), o que vira (entrada, saída,
transferência interna, pagamento de fatura, caixinha ou ignorar), se o dinheiro saiu ou entrou,
conta de destino, prioridade e ativa/desativada. A de maior prioridade que casar decide.

O padrão é testado contra **título + quebra de linha + texto**, ignorando maiúsculas. Grupos:

| Grupo | Para quê | Exemplo |
|---|---|---|
| `(?<valor>…)` | obrigatório | `R\$\s?(?<valor>\d[\d.]*(?:,\d{2})?)` (aceita “R$ 1”) |
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
Aba **Importar** → **Escolher arquivos** (PDF, CSV, Excel .xlsx/.xls, OFX ou finai-banco/1 .json).
Dá para escolher **vários arquivos de uma vez** (no seletor do Android, toque e segure no primeiro
e marque os outros). O app reconhece o banco de cada um e já escolhe a conta:

1. **formato já importado antes** (modelo salvo de uma conta com o mesmo cabeçalho);
2. **formato conhecido**: cabeçalho do CSV (tabela abaixo, mais o extrato da conta Nubank e o
   relatório do Mercado Pago), texto do PDF do Mercado Pago, código do banco no OFX (Nubank 260,
   Mercado Pago 323, Itaú 341, BB, Bradesco, Caixa, Santander, Inter, C6, XP…), com conta ou cartão;
3. **nome do arquivo** (ex.: “nubank”, “itau”, “fatura” → cartão).

A lista mostra cada arquivo com o banco reconhecido, o período e a conta (dá para trocar). Banco
sem conta no app (ex.: OFX do Itaú) ganha um botão **Criar conta**. Arquivo não reconhecido pede a
conta. **Ver colunas** abre o arquivo para conferir; **Importar N arquivos** importa todos e mostra o
resultado de cada um. Com um arquivo só, ele abre direto para conferir.

**Linhas:** antes de importar, a lista mostra como cada linha vai entrar (categoria, ou “Pagamento
de fatura”, “Caixinha”…). Toque para marcar linhas (ou **Marcar todas**) e use **Categoria**,
**Tipo**, **Inverter sinal** ou **Não importar** (linha tirada não volta ao reimportar o arquivo).
Em **Já importados**, toque num arquivo para ver as transações que vieram dele e fazer o mesmo
com elas depois (inclusive excluir). **Toque e segure** para marcar um ou mais arquivos e
**Remover**; há também **Remover tudo** e, na tela do arquivo, **Remover esta importação**.
Remover desfaz a importação: transações que vieram só do arquivo saem; as que já existiam por
notificação ou à mão continuam, com os dados de antes do extrato; dá para importar de novo depois.

Formatos conferidos com arquivos reais:

| Arquivo | Conta | Observação |
|---|---|---|
| Extrato da conta Mercado Pago (PDF) | Mercado Pago conta | lê descrição em várias linhas, número da operação (não duplica) e saldo |
| Fatura Rico (CSV `Data;Estabelecimento;Portador;Valor;Parcela`) | Rico crédito | parcela entra na descrição (“LOJA - 2 de 3”) |
| Fatura Nubank (CSV `date,title,amount`) | Nubank crédito | compras positivas: o sinal é invertido sozinho |
| Extrato Flash (CSV com Saldo) | Flash alimentação | o saldo do arquivo atualiza o saldo da conta |

**Fatura de cartão com sinal trocado** (compras positivas, como na Rico): o app inverte sozinho,
mesmo com modelo salvo. Se um arquivo já entrou assim, a tela dele oferece **Inverter o sinal de todas**.

Quando o arquivo traz **saldo** (PDF do Mercado Pago, Flash), o saldo da conta é atualizado com o
do movimento mais recente.
- CSV/Excel: confira o mapeamento de colunas na pré-visualização. Ele fica salvo como **modelo da
  conta** e é usado sozinho da próxima vez (mesmo cabeçalho). Fatura de cartão com compras
  positivas é detectada e o sinal é invertido (dá para mudar).
- **Sem duplicar:** reimportar o mesmo arquivo não cria nada. Linha do extrato que corresponde a
  uma transação de notificação ou manual (mesma conta, mesmo valor, data até 1 dia de diferença)
  é **unida** a ela: os dados do extrato prevalecem e a origem fica registrada. Se houver dúvida
  (mais de um candidato, ou 2–3 dias de diferença), a linha vai para **Revisão**.
- **Conferência mensal** (por conta): o que bateu, o que só está no extrato e o que só veio por
  notificação/manual.

### Filtros do Painel
O ícone de filtro ao lado do mês abre as escolhas: **contas**, **forma de pagamento** (Pix, crédito,
débito, vale…, só para gastos) e **categorias**. Tudo no Painel passa a mostrar só o que passa no
filtro (totais, gráficos, contas, faturas), e também a lista de entradas/saídas e a de cada
categoria. **Salvar estas escolhas como filtro** guarda com um nome; dá para usar **vários filtros
salvos ao mesmo tempo**: os valores do mesmo tipo se somam (Nubank ou Rico) e tipos diferentes se
combinam (Nubank e Rico, só em Alimentação). **Ajustes → Filtros salvos** cria, edita e exclui. O
filtro em uso vale até fechar o app.

Tocar em **Entradas** ou **Saídas** no topo do Painel abre a lista do mês, com as setas de mês e a
troca entre entradas e saídas.

### Avisos de repetido
Antes de gravar, o app pergunta se você quer continuar quando:
- o **arquivo já foi importado** (mesma conta, mesmo período, todas as linhas conhecidas: “Já
  existe uma importação exatamente como essa…”), ou parte das linhas já entrou (vão ser puladas);
- linhas novas são **iguais (conta, data e valor) a transações de outro extrato** (ex.: o mesmo mês em
  PDF e depois em CSV), que ficariam duplicadas;
- você **lança uma entrada/saída igual** (mesma conta, data, valor e descrição) ou parecida (mesma
  conta e valor, até 1 dia) a uma que já existe;
- cria uma **regra** igual (mesmo app e padrão), uma **regra de categoria** com o mesmo trecho
  (substitui) ou uma **conta** com o mesmo nome. Categoria com o mesmo nome não é criada.

Na lista de arquivos, o aviso já aparece em cada arquivo repetido. Quando há arquivos repetidos (todas as linhas já
importadas), a lista mostra **Importar novos** (em destaque, deixa os repetidos de fora) e
**Importar todos** (inclui os repetidos; as linhas repetidas são puladas).

### Fatura do cartão
Pagamento de fatura não é gasto nem entrada: cada compra já contou no dia em que foi feita. O
pagamento que aparece no cartão (“Pagamento recebido”, “Pagamento de fatura”) é ligado ao Pix ou
débito da sua conta que pagou, de 10 dias antes a 5 dias depois: primeiro pelo **mesmo valor** (com
dois candidatos, vence o que cita o banco do cartão ou “fatura”, depois o mais perto da data); se
não houver, pela **fatura arredondada em reais**: valor sem centavos a até R$ 5 (ou 1%) da fatura,
qualquer descrição (ex.: fatura de R$ 1.118,30 paga com R$ 1.118, 1.119 ou 1.120); por último, até 15%
(ou R$ 50) de diferença, só quando o Pix é para você mesmo (seu nome, em Ajustes) ou cita o banco do
cartão (Rico/XP, Nubank/Nu Pagamentos…).
A sobra fica na conta do banco e não conta como gasto (é dinheiro seu). Só conta como pagamento o
que o cartão mostra como pagamento de fatura (crédito comum no cartão é estorno), a saída nunca vem
de conta de vale (Flash, Alelo…) e, nos casos aproximados, precisa ter cara de pagamento (Pix,
transferência, boleto) e a fatura ser de pelo menos R$ 50. Cada fatura aparece no **mês dos gastos
dela**: o pagamento feito no começo do mês (ex.: dia 5) é a fatura do mês anterior. Os dois
ficam como “Pagamento de fatura”. O Painel mostra **Faturas pagas** no mês (cartão, valor, data e o
Pix que pagou) e a transação mostra a outra ponta.

### Categorias
Categorização automática por palavras-chave (editáveis em Ajustes → Categorias; vence o trecho mais
longo; `*` no fim = começo de palavra) e por regras criadas ao corrigir transações. O que ficou sem
categoria aparece no painel (“Categorizar N transações”).

### Regras de categoria (ex.: salário)
Para dizer “o que vem de tal pagador é salário”: Ajustes → Regras → **De categoria** → *Nova regra
de categoria*, com o trecho (ex.: `itau unibanco`), tipo **Entrada** e categoria **Salário**. Ou
abra uma dessas transações, escolha tipo e categoria, marque *aplicar* e ajuste o trecho. A regra
vale para extrato e notificação e vem antes da classificação automática (inclusive do “Pix para
você mesmo” e da junção de transferências entre contas).

### Seu nome
Em **Ajustes → Seu nome**, escreva seu nome como aparece nos bancos. Pix de você para você mesmo
(por exemplo “Pix recebido FULANO DE TAL” vindo de outra conta sua) passa a contar como
transferência interna, e não como entrada.

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

O workflow `.github/workflows/android.yml` roda em **push para qualquer branch** (só confere:
testes, typecheck e compilação, sem Release) e publica uma **versão nova** quando é pedida: commit
com `[versao]` no título (primeira linha) ou o botão **Actions → Android → Run workflow** (escolha o branch).
Assim as mudanças se acumulam e vão juntas numa versão só. Ele:

1. roda typecheck e testes (Vitest);
2. faz o build da interface (Vite) e copia para o projeto Android (Capacitor);
3. compila o APK de release e confere que ele **não** declara a permissão INTERNET;
4. (só quando pedida) assina com a sua chave (secrets) e publica uma **Release nova** com tag
   `v<versão>` (a primeira de `versoes` em `src/novidades.json`), notas com os itens dessa versão
   e o APK. Pelo botão, se a versão já existir, vira `v<versão>.<número da execução>`.
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
  versionName/tag = número da versão em `src/novidades.json` (1.7, 1.8…), que também guarda o
  histórico mostrado em **Ajustes → Novidades** e nas notas da Release. Pushes comuns não publicam.
- **Chave de assinatura EC P-256** (base64 curto para colar no celular), validade de 100 anos.
- APK assinado com `apksigner` no workflow (a chave nunca passa pelo Gradle nem pelo repositório).

- **Visual:** “caderno-caixa noturno”. Montserrat Alternates nos títulos e no nome do mês,
  Montserrat (fonte variável) no texto e nos números leves com algarismos tabulares, as duas
  embutidas no app. Cores de dados validadas para daltonismo no fundo escuro: entradas em azul,
  saídas em cobre (verde × vermelho falhava para deuteranopia).
- **Notificações reais conferidas:** Mercado Pago “Você recebeu R$ 1 / O valor que FULANO te
  transferiu via Pix” (entrada) e “Você depositou R$ 0,01 via Pix” (transferência interna: é
  dinheiro seu vindo de outra conta); Nubank “Recebemos sua transferência” (ignorada: a conta
  Nubank não está entre as acompanhadas); Flash “Compra de R$ X em LOJA realizada” (saída na
  conta Flash).
- **Flash:** pacote `br.com.flashapp` (Flash Pay), conta “Flash alimentação” do tipo conta.
- **Atualização dos dados (versão 2):** ao abrir a versão nova, o app acrescenta o Flash, as regras
  novas e as palavras-chave novas; atualiza só as regras que vieram com o app e que você não
  editou; e reprocessa as notificações que estavam sem regra.
- **Avisos com o app fechado:** o Android decide se avisa usando uma cópia das regras (enviada
  pelo app sempre que elas mudam); os botões ficam guardados e são aplicados quando o app abre.
- **PDF:** lido com pdf.js, embutido no app (sem internet).

## O que é chute ou está pendente

- **Regras iniciais das notificações:** Pix recebido e depósito (Mercado Pago), transferência
  (Nubank) e compra (Flash) foram conferidas com notificações reais; as demais (compras no
  Mercado Pago, Nubank e Rico, caixinha, fatura) ainda são chute. Use Adicionar/Ignorar ou o editor.
- **Regra automática (Adicionar):** acerta o comum (valor, loja/pessoa, entrada/saída); confira a
  conta e o tipo na primeira vez que usar com um app novo.
- **Palavras-chave das categorias**: lista genérica vinda do carteira.
- **Fabricantes agressivos com bateria** (Xiaomi/MIUI, alguns Samsung) podem parar o serviço
  mesmo com a bateria liberada; nesse caso o Android religa quando possível e o que estiver na
  barra de notificações é recuperado, mas notificações dispensadas enquanto o serviço estava
  parado não são.
- Não há leitura de saldo real das contas: o saldo é estimado a partir de um valor que você informa.
