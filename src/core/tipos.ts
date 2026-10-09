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
}

export interface AppMonitorado { pacote: string; nome: string; ativo: boolean }

export type AcaoRegra = TipoTx | 'ignorar';
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
  inverter: boolean;   // valores positivos são gastos (comum em fatura de cartão)
  formatoData: 'auto' | 'dmy' | 'ymd' | 'mdy';
}

export interface ModeloImport extends Mapeamento { id: string; conta: string; nome: string; assinatura: string }

/** Uma linha de extrato já normalizada. */
export interface LinhaExtrato { conta: string; data: string; desc: string; valor: number; chave: string }

/** Linha de extrato que pode ser a mesma de uma transação existente: você decide. */
export interface Revisao { id: string; linha: LinhaExtrato; candidatos: string[]; arquivo: string; em: string }

export interface Importacao {
  id: string; arquivo: string; conta: string; em: string; de: string; ate: string;
  novas: number; unidas: number; revisao: number; repetidas: number;
}

export interface Config {
  boasVindasVista: boolean;
  /** Mês aberto no painel (AAAA-MM). */
  mes?: string;
}

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
  config: Config;
}
