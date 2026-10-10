// Reconhece de que instituição (e se é conta ou cartão) é um arquivo de extrato/fatura, para
// importar vários de uma vez sem escolher a conta de cada um. Ordem de confiança:
// 1. modelo salvo de uma conta com o mesmo cabeçalho (o app aprende a cada importação);
// 2. "assinatura" do formato (cabeçalho do CSV, texto do PDF, código do banco no OFX);
// 3. nome do arquivo.
// Formatos conferidos com arquivos reais: PDF da conta Mercado Pago, fatura Nubank CSV,
// fatura Rico (XP) CSV e extrato Flash CSV. Os demais são conhecidos, mas sem arquivo real.
import type { Conta, ModeloImport, TipoConta } from '../core/tipos';
import { norm } from '../core/util';
import { assinatura } from './mapear';
import type { Celula } from './planilha';

export interface Fonte {
  banco: string;          // como aparece no campo "banco" das contas (ex.: "Nubank")
  tipo?: TipoConta;       // conta ou cartão, quando dá para saber
  rotulo: string;         // para mostrar: "fatura do cartão Nubank"
  por: 'modelo' | 'formato' | 'nome';
  conta?: string;         // quando veio de um modelo salvo, a conta já é conhecida
}

export interface ArquivoLido {
  nome: string;
  rows?: Celula[][];      // CSV/Excel
  textoPdf?: string;      // texto do PDF
  ofx?: { cartao: boolean; banco: string; bankId?: string };   // banco = ORG do OFX
}

const cab = (rows: Celula[][], max = 30) => rows.slice(0, max).map(r => r.map(c => norm(String(c ?? '')).trim()));
const tem = (linha: string[], ...nomes: string[]) => nomes.every(n => linha.includes(n));

/** Assinaturas de cabeçalho conhecidas. */
const FORMATOS: { teste: (l: string[]) => boolean; fonte: Omit<Fonte, 'por'> }[] = [
  // Nubank: fatura do cartão (CSV exportado no app): date,title,amount
  { teste: l => l.length === 3 && tem(l, 'date', 'title', 'amount'), fonte: { banco: 'Nubank', tipo: 'cartao', rotulo: 'fatura do cartão Nubank' } },
  // Nubank: extrato da conta: Data,Valor,Identificador,Descrição
  { teste: l => tem(l, 'data', 'valor', 'identificador', 'descricao'), fonte: { banco: 'Nubank', tipo: 'corrente', rotulo: 'extrato da conta Nubank' } },
  // Rico / XP: fatura do cartão: Data;Estabelecimento;Portador;Valor;Parcela
  { teste: l => tem(l, 'data', 'estabelecimento', 'portador', 'valor'), fonte: { banco: 'Rico', tipo: 'cartao', rotulo: 'fatura do cartão Rico' } },
  // Flash: extrato: Data,Hora,Movimentação,Valor,Meio de Pagamento,Saldo
  { teste: l => tem(l, 'data', 'movimentacao', 'valor') && l.includes('meio de pagamento'), fonte: { banco: 'Flash', tipo: 'corrente', rotulo: 'extrato Flash' } },
  // Mercado Pago: relatório da conta em planilha (RELEASE_DATE, TRANSACTION_NET_AMOUNT…)
  { teste: l => l.includes('release date') && l.some(x => x.includes('net amount')), fonte: { banco: 'Mercado Pago', tipo: 'corrente', rotulo: 'extrato da conta Mercado Pago' } },
];

/** Código do banco (COMPE) no OFX → nome usado nas contas. */
const BANCOS: Record<string, string> = {
  '260': 'Nubank', '323': 'Mercado Pago', '341': 'Itaú', '1': 'Banco do Brasil', '237': 'Bradesco', '104': 'Caixa',
  '33': 'Santander', '77': 'Inter', '336': 'C6', '102': 'XP', '212': 'Original', '380': 'PicPay', '290': 'PagBank',
};

/** Nome da instituição escrito no arquivo (ORG do OFX) ou no nome do arquivo. */
const NOMES: [RegExp, string][] = [
  [/nubank|nu ?pagamentos|(^|[^a-z])nu[_\- ]/i, 'Nubank'],
  [/mercado.?pago|(^|[^a-z])mp[_\- ]/i, 'Mercado Pago'],
  [/flash/i, 'Flash'],
  [/(^|[^a-z])rico([^a-z]|$)/i, 'Rico'],
  [/ita[uú]/i, 'Itaú'],
];
const bancoPorNome = (t: string) => NOMES.find(([re]) => re.test(t))?.[1] || '';

/** Conta cujo modelo salvo tem o mesmo cabeçalho deste arquivo (só se for uma conta só). */
export function contaPorModelo(modelos: ModeloImport[], rows: Celula[][]): ModeloImport | null {
  const iguais = modelos.filter(m => assinatura(rows, m.linhaCab) === m.assinatura);
  const contas = new Set(iguais.map(m => m.conta));
  return contas.size === 1 ? iguais[iguais.length - 1] : null;
}

/** Reconhece a instituição do arquivo. null = não deu para saber. */
export function detectarFonte(a: ArquivoLido, modelos: ModeloImport[] = []): Fonte | null {
  if (a.rows?.length) {
    let fmt: Fonte | null = null;
    for (const l of cab(a.rows)) { const f = FORMATOS.find(x => x.teste(l)); if (f) { fmt = { ...f.fonte, por: 'formato' }; break; } }
    const md = contaPorModelo(modelos, a.rows);
    if (md) return { banco: fmt?.banco || '', ...(fmt?.tipo ? { tipo: fmt.tipo } : {}), rotulo: fmt?.rotulo || 'mesmo formato de um arquivo já importado', por: 'modelo', conta: md.conta };
    if (fmt) return fmt;
  }
  if (a.textoPdf) {
    const t = norm(a.textoPdf);
    if (/ mercado ?pago /.test(t) || / mercadopago /.test(t)) {
      const cartao = / fatura /.test(t) && !/ extrato de conta /.test(t);
      return { banco: 'Mercado Pago', tipo: cartao ? 'cartao' : 'corrente', rotulo: cartao ? 'fatura do cartão Mercado Pago' : 'extrato da conta Mercado Pago', por: 'formato' };
    }
  }
  if (a.ofx) {
    const id = a.ofx.bankId ? String(Number(a.ofx.bankId)) : '';
    const org = a.ofx.banco && !/^\d+$/.test(a.ofx.banco) ? a.ofx.banco : '';
    const banco = BANCOS[id] || bancoPorNome(org) || org;
    if (banco) return { banco, tipo: a.ofx.cartao ? 'cartao' : 'corrente', rotulo: `${a.ofx.cartao ? 'fatura do cartão' : 'extrato da conta'} ${banco}`, por: 'formato' };
  }
  const banco = bancoPorNome(a.nome);
  if (banco) {
    const tipo: TipoConta | undefined = a.ofx ? (a.ofx.cartao ? 'cartao' : 'corrente') : /fatura|cart[aã]o/i.test(a.nome) ? 'cartao' : /extrato|conta/i.test(a.nome) ? 'corrente' : undefined;
    return { banco, ...(tipo ? { tipo } : {}), rotulo: `${banco}, pelo nome do arquivo`, por: 'nome' };
  }
  return null;
}

/**
 * Conta do app para a instituição reconhecida: mesmo banco (pelo nome) e, se souber, mesmo tipo.
 * Sem tipo conhecido, só escolhe se o banco tiver uma conta só.
 */
export function contaDaFonte(f: Fonte, contas: Conta[]): string | null {
  if (f.conta) return contas.some(c => c.id === f.conta) ? f.conta : null;
  const alvo = norm(f.banco).trim();
  if (!alvo) return null;
  const doBanco = contas.filter(c => c.ativa && (norm(c.banco).trim() === alvo || norm(c.nome).includes(` ${alvo} `)));
  if (f.tipo) return doBanco.find(c => c.tipo === f.tipo)?.id ?? null;
  return doBanco.length === 1 ? doBanco[0].id : null;
}
