// Classificação das transações (adaptada do carteira, src/banco/classificar.ts): o que é entrada e
// saída de verdade, o que é dinheiro seu só mudando de lugar (caixinha, outra conta sua, pagamento
// da fatura) e em que categoria cada gasto cai. Funções puras, testadas em tests/classificar.test.ts.
import type { Categoria, Conta, RegraCat, TipoTx, Transacao } from './tipos';
import { diasEntre, norm, somaDias } from './util';

const CAIXINHA = / (caixinhas?|cofrinhos?|cofre|dinheiro reservado|dinheiro retirado|reservado|reserva por|retirada da reserva|guardado|porquinho|aplicacao|aplic|resgate|cdb|lci|lca|tesouro direto|investimento|fundo de investimento|previdencia) /;
const FATURA = / (pagamento (da |de )?fatura|pagto fatura|pgto fatura|pagamento cartao|pagamento de cartao|fatura cartao|pagamento recebido|pagamento efetuado|credit card payment) /;

/** Conta de vale-refeição/alimentação (Flash, Alelo…): não paga fatura nem recebe Pix seu. */
const VALES = /\b(flash|alelo|sodexo|pluxee|ticket|vr beneficios|vr|caju|swile|ben visa|valecard|greencard)\b/;
export const ehContaVale = (c?: Pick<Conta, 'banco' | 'nome'>) => !!c && VALES.test(norm(c.banco + ' ' + c.nome));

/** Saída que pode ser o pagamento de uma fatura (não uma compra numa loja). */
const PAGAVEL = / (pix|transf\w*|ted|doc|boleto|pagamento|pgto|pagto|fatura|debito automatico|deposito) /;

/** Outros nomes com que o banco do cartão aparece na descrição de um Pix. */
const APELIDOS: Record<string, string[]> = {
  rico: ['rico', 'xp', 'xp investimentos'],
  nubank: ['nubank', 'nu pagamentos', 'nu financeira'],
  'mercado pago': ['mercado pago', 'mercadopago'],
  itau: ['itau', 'itau unibanco'],
  inter: ['inter', 'banco inter'],
  c6: ['c6', 'c6 bank'],
};

/** Pix/transferência de você para você mesmo: o nome do titular (2 primeiras palavras e a última) aparece na descrição. */
export function ehTitular(desc: string, titular: string): boolean {
  const p = norm(titular).trim().split(' ').filter(x => x.length > 1);
  if (p.length < 2) return false;
  const t = norm(desc);
  const chave = p.length > 2 ? [p[0], p[1], p[p.length - 1]] : p;
  return / (pix|transf|ted|doc|deposit)/.test(t) && chave.every(x => t.includes(` ${x} `));
}

/** Tipo automático de uma transação, olhando só para ela (sem regra nem escolha sua). */
export function tipoAuto(desc: string, valor: number, cartao: boolean, titular = ''): TipoTx {
  const t = norm(desc);
  if (!cartao && titular && ehTitular(desc, titular)) return 'interna';
  if (cartao) {
    // No cartão: pagamento da fatura (qualquer sinal: há faturas que trazem as compras positivas)
    // ou estorno (estorno desconta do gasto, por isso "saída" positiva).
    if (FATURA.test(t)) return 'fatura';
    return 'saida';
  }
  if (CAIXINHA.test(t)) return 'caixinha';
  if (FATURA.test(t)) return 'fatura';
  return valor >= 0 ? 'entrada' : 'saida';
}

/** Índice de palavras das categorias: vence o trecho mais longo encontrado na descrição. */
export function indicePalavras(cats: Categoria[]) {
  const itens: { re: RegExp; cat: string; n: number; receita: boolean }[] = [];
  for (const c of cats) for (const p0 of c.palavras) {
    const pref = p0.endsWith('*');
    const p = norm(pref ? p0.slice(0, -1) : p0).trim();
    if (!p) continue;
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    itens.push({ re: new RegExp(` ${esc}${pref ? '' : ' '}`), cat: c.nome, n: p.length, receita: c.receita });
  }
  return (desc: string, entrada: boolean): string | null => {
    const t = norm(desc);
    let melhor: { cat: string; n: number } | null = null;
    for (const i of itens) {
      if (i.receita !== entrada) continue; // entrada só cai em categoria de receita, e vice-versa
      if ((!melhor || i.n > melhor.n) && i.re.test(t)) melhor = i;
    }
    return melhor?.cat ?? null;
  };
}

export interface Classificada extends Transacao {
  t: TipoTx;          // tipo final
  c: string;          // categoria final ('' = sem categoria)
  auto: boolean;      // tipo decidido pelo app (sem escolha sua nem regra de categoria)
  par?: string;       // a outra ponta: transferência entre contas suas, ou Pix/débito que pagou a fatura
}

export interface Contexto { contas: Conta[]; categorias: Categoria[]; regrasCat: RegraCat[]; titular?: string }

/**
 * Classifica todas as transações. Além do tipo de cada uma, junta pares: o mesmo valor saindo de
 * uma conta sua e entrando em outra conta sua em até 3 dias é transferência interna; o pagamento
 * da fatura no cartão casa com o Pix/débito que o pagou (mesmo valor, ou a fatura arredondada em
 * reais; 10 dias antes a 5 depois).
 */
export function classificar(txs: Transacao[], ctx: Contexto): Classificada[] {
  const tipoConta = new Map(ctx.contas.map(c => [c.id, c.tipo]));
  const regras = ctx.regrasCat.map(r => ({ ...r, t: ` ${r.termo} ` }));
  const catPorPalavra = indicePalavras(ctx.categorias);

  const out: Classificada[] = txs.map(tx => {
    const cartao = tipoConta.get(tx.conta) === 'cartao';
    let t: TipoTx = tx.tipo ?? tipoAuto(tx.desc, tx.valor, cartao, ctx.titular);
    let c: string | null = null;
    let auto = true;
    const d = norm(tx.desc);
    for (const r of regras) if (d.includes(r.t)) { if (r.tipo) { t = r.tipo; auto = false; } if (r.cat) c = r.cat; }
    if (tx.tipoUsuario) { t = tx.tipoUsuario; auto = false; }
    if (tx.cat) c = tx.cat;
    if (c == null) c = catPorPalavra(tx.desc, t === 'entrada') ?? '';
    return { ...tx, t, c, auto };
  });

  // Pares entre contas diferentes (ex.: Pix da sua conta do banco A para a do banco B).
  const livres = out.filter(x => x.auto && (x.t === 'entrada' || x.t === 'saida') && tipoConta.get(x.conta) !== 'cartao');
  const usados = new Set<Classificada>();
  for (const e of livres) {
    if (e.valor <= 0 || usados.has(e)) continue;
    const s = livres.find(x => !usados.has(x) && x.valor < 0 && x.conta !== e.conta && Math.abs(x.valor + e.valor) < 0.005 && diasEntre(x.data, e.data) <= 3);
    if (s) { e.t = 'interna'; s.t = 'interna'; e.par = s.id; s.par = e.id; usados.add(e); usados.add(s); }
  }
  // Pagamento da fatura: o pagamento que aparece no cartão casa com a saída da sua conta que o
  // pagou (o Pix ou débito), de 10 dias antes até 5 dias depois. Os dois ficam fora de entradas e
  // gastos: o gasto já contou em cada compra.
  // 1º) mesmo valor;
  // 2º) a fatura arredondada em reais, sem centavos (R$ 1.118,30 → 1.118, 1.119 ou 1.120): até
  //     R$ 5 ou 1% de diferença, qualquer descrição;
  // 3º) valor mais solto (até 15% ou R$ 50 de diferença) só se a saída for para você mesmo (seu nome)
  //     ou citar o banco do cartão.
  // A sobra fica na conta do banco do cartão (ou a falta sai do que já estava lá): não é gasto.
  const ehCartao = (x: Classificada) => tipoConta.get(x.conta) === 'cartao';
  const bancoDe = new Map(ctx.contas.map(c => [c.id, norm(c.banco).trim()]));
  // Só o que é pagamento de fatura no cartão ("Pagamento recebido", regra, sua escolha). Crédito
  // qualquer no cartão é estorno, não pagamento.
  const vale = new Set(ctx.contas.filter(c => ehContaVale(c)).map(c => c.id));
  const pagamentos = out.filter(x => ehCartao(x) && x.t === 'fatura').sort((a, b) => a.data.localeCompare(b.data));
  const antes = (cc: Classificada, x: Classificada) => (Date.parse(cc.data) - Date.parse(x.data)) / 864e5;
  const podePagar = (cc: Classificada, x: Classificada) => !usados.has(x) && !ehCartao(x) && !vale.has(x.conta) && x.valor < 0
    && antes(cc, x) <= 10 && antes(cc, x) >= -5 && (x.t === 'fatura' || (x.auto && (x.t === 'saida' || x.t === 'interna')));
  const citaBanco = (cc: Classificada, x: Classificada) => {
    const d = norm(x.desc), b = bancoDe.get(cc.conta) || '';
    return / fatura /.test(d) || (!!b && (APELIDOS[b] || [b]).some(a => d.includes(` ${a} `)));
  };
  const ligar = (cc: Classificada, p: Classificada) => { p.t = 'fatura'; cc.t = 'fatura'; p.par = cc.id; cc.par = p.id; usados.add(p); usados.add(cc); };
  for (const cc of pagamentos) {
    const v = Math.abs(cc.valor);
    const cands = out.filter(x => podePagar(cc, x) && Math.abs(-x.valor - v) < 0.005);
    if (!cands.length) continue;
    // Com dois de mesmo valor, vence o que cita o banco do cartão ou "fatura"; depois, o mais perto da data.
    ligar(cc, cands.sort((a, b) => Number(citaBanco(cc, b)) - Number(citaBanco(cc, a)) || Math.abs(antes(cc, a)) - Math.abs(antes(cc, b)))[0]);
  }
  const semCentavos = (x: Classificada) => Math.abs(x.valor * 100) % 100 < 0.5;
  const proprio = (cc: Classificada, x: Classificada) => citaBanco(cc, x) || (!!ctx.titular && ehTitular(x.desc, ctx.titular));
  const aproximar = (filtro: (cc: Classificada, x: Classificada, v: number) => boolean) => {
    for (const cc of pagamentos) {
      if (usados.has(cc)) continue;
      const v = Math.abs(cc.valor);
      const cands = out.filter(x => podePagar(cc, x) && filtro(cc, x, v));
      if (!cands.length) continue;
      // Vence a que é para você ou cita o banco; depois, a de valor mais perto; depois, a data mais perto.
      ligar(cc, cands.sort((a, b) => Number(proprio(cc, b)) - Number(proprio(cc, a)) || Math.abs(-a.valor - v) - Math.abs(-b.valor - v)
        || Math.abs(antes(cc, a)) - Math.abs(antes(cc, b)))[0]);
    }
  };
  // Aproximado: só fatura de R$ 50 ou mais e saída com cara de pagamento (Pix, transferência, boleto…).
  const pagavel = (x: Classificada) => PAGAVEL.test(norm(x.desc)) || x.t === 'fatura';
  aproximar((_, x, v) => v >= 50 && pagavel(x) && semCentavos(x) && Math.abs(-x.valor - v) <= Math.max(5, v * 0.01));
  aproximar((cc, x, v) => v >= 50 && proprio(cc, x) && Math.abs(-x.valor - v) <= Math.max(50, v * 0.15));
  return out;
}

/**
 * Mês da fatura que um pagamento quita: a fatura vence no começo do mês seguinte ao dos gastos
 * (ex.: paga em 05/10 = fatura de setembro; paga em 31/08 = fatura de agosto). Regra: 15 dias antes
 * da data do pagamento.
 */
export const mesDaFatura = (data: string) => somaDias(data, -15).slice(0, 7);

export const SEM_CATEGORIA = 'Sem categoria';

export interface ResumoMes {
  entradas: number;
  saidas: number;        // já descontados os estornos
  saldo: number;
  fora: { caixinha: number; interna: number; fatura: number }; // volume movimentado que não conta
  porCategoria: { cat: string; v: number; n: number }[];
  entradasPorCategoria: { cat: string; v: number; n: number }[];
  semCategoria: number;  // quantas transações que contam estão sem categoria
}

export function resumoMes(cls: Classificada[], mes: string, conta?: string): ResumoMes {
  let entradas = 0, saidas = 0, semCategoria = 0;
  const fora = { caixinha: 0, interna: 0, fatura: 0 };
  const gastos = new Map<string, { v: number; n: number }>(), ganhos = new Map<string, { v: number; n: number }>();
  const soma = (m: Map<string, { v: number; n: number }>, k: string, v: number) => { const g = m.get(k) || { v: 0, n: 0 }; g.v += v; g.n++; m.set(k, g); };
  for (const x of cls) {
    if (x.data.slice(0, 7) !== mes || (conta && x.conta !== conta)) continue;
    const cat = x.c || SEM_CATEGORIA;
    if (x.t === 'entrada') { entradas += x.valor; soma(ganhos, cat, x.valor); if (!x.c) semCategoria++; }
    else if (x.t === 'saida') { saidas -= x.valor; soma(gastos, cat, -x.valor); if (!x.c) semCategoria++; }
    else fora[x.t] += Math.abs(x.valor);
  }
  const lista = (m: Map<string, { v: number; n: number }>) =>
    [...m].map(([cat, g]) => ({ cat, v: g.v, n: g.n })).filter(g => g.v > 0.005).sort((a, b) => b.v - a.v);
  return { entradas, saidas, saldo: entradas - saidas, fora, porCategoria: lista(gastos), entradasPorCategoria: lista(ganhos), semCategoria };
}

/** Entradas e saídas dos últimos `n` meses até `mes` (inclusive). */
export function serieMeses(cls: Classificada[], mes: string, n = 12): { mes: string; entradas: number; saidas: number }[] {
  const meses: string[] = [];
  let [y, m] = mes.split('-').map(Number);
  for (let i = 0; i < n; i++) { meses.unshift(`${y}-${String(m).padStart(2, '0')}`); if (--m === 0) { m = 12; y--; } }
  const idx = new Map(meses.map((k, i) => [k, i]));
  const out = meses.map(k => ({ mes: k, entradas: 0, saidas: 0 }));
  for (const x of cls) {
    const i = idx.get(x.data.slice(0, 7));
    if (i == null) continue;
    if (x.t === 'entrada') out[i].entradas += x.valor;
    else if (x.t === 'saida') out[i].saidas -= x.valor;
  }
  return out;
}

/** Saldo estimado: saldo informado na data de referência + transações depois dela. */
export function saldoEstimado(txs: Transacao[], conta: Conta): number | null {
  if (!conta.saldoRef) return null;
  const ref = conta.saldoRef;
  return Math.round((ref.valor + txs.filter(t => t.conta === conta.id && t.data > ref.data).reduce((s, t) => s + t.valor, 0)) * 100) / 100;
}
