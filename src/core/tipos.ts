// Tipos do app. Tudo fica no aparelho (IndexedDB); nada vai para a rede.

export type TipoConta = 'corrente' | 'cartao';

export interface Conta {
  id: string;          // estável: usado no backup e na exportação finai-banco/1
  nome: string;        // ex.: "Mercado Pago conta"
  banco: string;       // ex.: "Mercado Pago"
  tipo: TipoConta;
  ativa: boolean;
  /** Saldo informado por você numa data; o app soma as transações seguintes para estimar o saldo atual. */
  saldoRef?: { valor: number; data: string };
}

/**
 * O que a transação é. Só entrada e saída contam no dashboard; caixinha, transferência
 * interna e pagamento de fatura são dinheiro seu mudando de lugar.
 */
export type TipoTx = 'entrada' | 'saida' | 'interna' | 'fatura' | 'caixinha';

export const TIPOS: Record<TipoTx, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  interna: 'Transferência interna',
  fatura: 'Pagamento de fatura',
  caixinha: 'Caixinha / reserva',
};

export const contaNoTotal = (t: TipoTx) => t === 'entrada' || t === 'saida';

export type TipoOrigem = 'notificacao' | 'manual' | 'extrato';
export const ORIGENS: Record<TipoOrigem, string> = { notificacao: 'Notificação', manual: 'Manual', extrato: 'Extrato' };

/** De onde a transação veio, com os dados como chegaram (o extrato prevalece na transação). */
export interface Origem {
  tipo: TipoOrigem;
  ref: string;         // notificação: id da notificação; extrato: chave da linha; manual: id da transação
  em: string;          // ISO de quando entrou
  data: string;
  desc: string;
  valor: number;
  arquivo?: string;    // extrato: nome do arquivo
}

/**
 * Transação. `valor` segue o ponto de vista do seu dinheiro (igual ao finai-banco/1):
 * negativo = saiu/gastou (inclusive compra no cartão), positivo = entrou (ou estorno/pagamento no cartão).
 */
export interface Transacao {
  id: string;
  conta: string;
  data: string;        // AAAA-MM-DD
  desc: string;
  valor: number;
  tipo?: TipoTx;       // sugerido pela fonte (regra de notificação); sem ele, o app decide pela descrição
  tipoUsuario?: TipoTx; // escolhido por você (não muda sozinho)
  cat?: string;        // categoria escolhida por você (não muda sozinha)
  nota?: string;
  /** Entrada que é reembolso de um gasto: id do gasto ('' = reembolso sem gasto ligado). */
  reembolsa?: string;
  /** Você disse que esta entrada não é reembolso (o app para de sugerir). */
  semReembolso?: boolean;
  origens: Origem[];
  criadoEm: string;
}

export type StatusNotif = 'transacao' | 'ignorada' | 'sem-regra' | 'erro';
export const STATUS_NOTIF: Record<StatusNotif, string> = {
  transacao: 'Virou transação', ignorada: 'Ignorada', 'sem-regra': 'Sem regra', erro: 'Erro na regra',
};

/** Notificação capturada de um app monitorado (texto bruto guardado para reprocessar). */
export interface Notificacao {
  id: string;          // chave única vinda do Android (evita processar a mesma duas vezes)
  pacote: string;
  titulo: string;
  texto: string;
  quando: number;      // epoch ms
  status: StatusNotif;
  regra?: string;      // id da regra que casou
  tx?: string;         // id da transação criada/ligada
  erro?: string;
  simulada?: boolean;
  /** Ignorada pelo filtro de Ajustes → Avançado, antes das regras: 'valor' (sem $ nem reais) ou 'palavra:<p>'. */
  filtro?: string;
}

export interface AppMonitorado {
  pacote: string;
  nome: string;
  ativo: boolean;
  /** Conta usada pelas regras criadas automaticamente para este app (vazio = o app escolhe pelo nome do banco). */
  conta?: string;
}

export type AcaoRegra = TipoTx | 'ignorar';

/** De onde a regra veio. */
export type OrigemRegra = 'padrao' | 'manual' | 'notificacao' | 'automatica';
export const ORIGENS_REGRA: Record<OrigemRegra, string> = {
  padrao: 'Veio com o app',
  manual: 'Criada por você',
  notificacao: 'A partir de notificação',
  automatica: 'Automática (botão do aviso)',
};
export const ACOES: Record<AcaoRegra, string> = { ...TIPOS, ignorar: 'Ignorar (não vira transação)' };

/** Regra que transforma notificação em transação. */
export interface RegraNotif {
  id: string;
  nome: string;
  pacote: string;
  /** Expressão regular (sem barras, ignora maiúsculas) aplicada a "título\ntexto". Grupos: valor (obrigatório), desc, data. */
  padrao: string;
  /** Modelo da descrição, com {grupo} (ex.: "Pix de {desc}"). Vazio: grupo desc, ou o título. */
  descricao?: string;
  acao: AcaoRegra;
  sentido: 'sai' | 'entra';
  conta: string;
  prioridade: number;  // maior é testada primeiro
  ativa: boolean;
  origem: OrigemRegra;
  criadaEm: string;    // ISO ('' nas que vieram com o app)
}

export interface Categoria {
  nome: string;
  receita: boolean;    // categoria de entrada (salário, rendimentos…)
  /** Palavras ou trechos procurados na descrição (sem acento, minúsculas). "*" no fim = começo de palavra. */
  palavras: string[];
}

/** Regra "tudo que contém X na descrição vira Y" (criada ao corrigir uma transação). */
export interface RegraCat { id: string; termo: string; cat?: string; tipo?: TipoTx }

/** Como ler as colunas de uma planilha/CSV de extrato. Salvo por conta. */
export interface Mapeamento {
  linhaCab: number;    // índice da linha do cabeçalho (-1 = sem cabeçalho)
  colData: number;
  colDesc: number;
  colDesc2: number;    // -1 = nenhuma
  colValor: number;    // -1 = usa crédito/débito
  colCredito: number;
  colDebito: number;
  colSaldo: number;    // -1 = nenhuma; com saldo, o app atualiza o saldo da conta
  inverter: boolean;   // valores positivos são gastos (comum em fatura de cartão)
  formatoData: 'auto' | 'dmy' | 'ymd' | 'mdy';
}

export interface ModeloImport extends Mapeamento { id: string; conta: string; nome: string; assinatura: string }

/** Uma linha de extrato já normalizada. */
export interface LinhaExtrato {
  conta: string; data: string; desc: string; valor: number; chave: string;
  /** Escolhidos na pré-visualização da importação: passam para a transação. */
  cat?: string; tipoUsuario?: TipoTx;
}

/** Linha de extrato que pode ser a mesma de uma transação existente: você decide. */
export interface Revisao { id: string; linha: LinhaExtrato; candidatos: string[]; arquivo: string; em: string }

export interface Importacao {
  id: string; arquivo: string; conta: string; em: string; de: string; ate: string;
  novas: number; unidas: number; revisao: number; repetidas: number;
}

/** Avisos do app quando chega notificação de app monitorado. */
export type ModoAvisos = 'sem-regra' | 'todas' | 'nunca';
export const MODOS_AVISOS: Record<ModoAvisos, string> = {
  'sem-regra': 'Só as que não têm regra',
  todas: 'Todas (inclusive as que viraram transação)',
  nunca: 'Não avisar',
};

/** Notificação sem valor ($ ou reais) ou com uma destas palavras é ignorada antes das regras. */
export interface FiltroNotif { exigirValor: boolean; palavras: string[] }

export interface Config {
  boasVindasVista: boolean;
  /** Seu nome como aparece nos bancos: Pix de/para você mesmo vira transferência interna. */
  titular: string;
  avisos: ModoAvisos;
  /** Filtro antes das regras (vale também para o aviso do Android). */
  filtroNotif: FiltroNotif;
  /** Versão dos dados (migrações em migracoes.ts). */
  versaoDados: number;
}

/** Filtro do Painel (campo vazio = sem restrição). `formas`: chaves de FORMAS (indicadores.ts). */
export interface Filtro { contas: string[]; formas: string[]; cats: string[] }
export interface FiltroSalvo extends Filtro { id: string; nome: string }

export interface Dados {
  contas: Conta[];
  txs: Transacao[];
  notifs: Notificacao[];
  apps: AppMonitorado[];
  regras: RegraNotif[];
  categorias: Categoria[];
  regrasCat: RegraCat[];
  modelos: ModeloImport[];
  revisoes: Revisao[];
  importacoes: Importacao[];
  /** Chaves de linhas de extrato cujas transações você excluiu (reimportar não traz de volta). */
  excluidas: string[];
  /** Filtros salvos do Painel. */
  filtros: FiltroSalvo[];
  config: Config;
}
