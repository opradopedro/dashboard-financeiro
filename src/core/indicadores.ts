// Indicadores do Painel: forma de pagamento, gasto por conta, ritmo do mês (acumulado dia a dia e
// comparação com o mês anterior), dias da semana, maiores gastos e lugares onde mais gastou.
// Tudo conta só as saídas (gasto); estorno (saída com valor positivo) desconta.
import { ehContaVale, type Classificada } from './classificar';
import type { Conta } from './tipos';
import { norm, somaMes, termoDe } from './util';

export type Forma = 'credito' | 'pix' | 'debito' | 'vale' | 'boleto' | 'transferencia' | 'saque';
export const FORMAS: Record<Forma, string> = {
  credito: 'Crédito', pix: 'Pix', debito: 'Débito', vale: 'Vale-benefício', boleto: 'Boleto e contas', transferencia: 'Transferência', saque: 'Saque',
};


/** Forma de pagamento de um gasto, pelo tipo da conta e pela descrição. */
export function formaPagamento(x: { desc: string; origens?: { desc: string }[] }, conta?: Conta): Forma {
  if (conta?.tipo === 'cartao') return 'credito';
  if (ehContaVale(conta)) return 'vale';
  const t = norm([x.desc, ...(x.origens || []).map(o => o.desc)].join(' '));
  if (/ pix | qr ?code | qr /.test(t)) return 'pix';
  if (/ boleto | pagamento de conta | conta de (luz|agua|gas|telefone|internet) | convenio /.test(t)) return 'boleto';
  if (/ saque /.test(t)) return 'saque';
  if (/ ted | doc | transferencia /.test(t)) return 'transferencia';
  return 'debito';
}

const gasto = (x: Classificada) => (x.t === 'saida' ? -x.valor : 0);
const doMes = (cls: Classificada[], mes: string) => cls.filter(x => x.t === 'saida' && x.data.slice(0, 7) === mes);

export interface Fatia<K extends string = string> { chave: K; v: number; n: number }

function agrupar<K extends string>(xs: Classificada[], chave: (x: Classificada) => K): Fatia<K>[] {
  const m = new Map<K, Fatia<K>>();
  for (const x of xs) {
    const k = chave(x);
    const f = m.get(k) || { chave: k, v: 0, n: 0 };
    f.v += gasto(x); f.n++;
    m.set(k, f);
  }
  return [...m.values()].filter(f => f.v > 0.005).sort((a, b) => b.v - a.v);
}

/** Gasto do mês por forma de pagamento. */
export const porForma = (cls: Classificada[], contas: Conta[], mes: string) => {
  const c = new Map(contas.map(x => [x.id, x]));
  return agrupar(doMes(cls, mes), x => formaPagamento(x, c.get(x.conta)));
};

/** Gasto do mês por conta/cartão. */
export const porConta = (cls: Classificada[], mes: string) => agrupar(doMes(cls, mes), x => x.conta);

export const diasNoMes = (mes: string) => { const [y, m] = mes.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** Gasto acumulado até cada dia do mês (índice 0 = dia 1). */
export function acumulado(cls: Classificada[], mes: string): number[] {
  const dia = Array(diasNoMes(mes)).fill(0) as number[];
  for (const x of doMes(cls, mes)) dia[Number(x.data.slice(8, 10)) - 1] += gasto(x);
  let s = 0;
  return dia.map(v => (s += v));
}

export interface Ritmo {
  dias: number;             // dias do mês já passados (o mês todo, se já acabou)
  total: number;            // gasto até agora
  porDia: number;           // média por dia
  projecao: number | null;  // no ritmo atual, quanto fecha o mês (só no mês corrente)
  anterior: number;         // gasto do mês anterior até o mesmo dia
  variacao: number | null;  // total / anterior - 1 (null sem base de comparação)
}

/** Ritmo de gastos do mês, comparado ao mês anterior até o mesmo dia. */
export function ritmo(cls: Classificada[], mes: string, hoje: string): Ritmo {
  const n = diasNoMes(mes);
  const dias = mes < hoje.slice(0, 7) ? n : mes === hoje.slice(0, 7) ? Number(hoje.slice(8, 10)) : 0;
  const ac = acumulado(cls, mes);
  const total = dias ? ac[dias - 1] : 0;
  const acAnt = acumulado(cls, somaMes(mes, -1));
  const anterior = dias ? acAnt[Math.min(dias, acAnt.length) - 1] : 0;
  return {
    dias, total,
    porDia: dias ? total / dias : 0,
    projecao: mes === hoje.slice(0, 7) && dias ? (total / dias) * n : null,
    anterior,
    variacao: anterior > 0.005 ? total / anterior - 1 : null,
  };
}

/** Gasto por dia da semana (0 = domingo). */
export function porDiaSemana(cls: Classificada[], mes: string): number[] {
  const s = Array(7).fill(0) as number[];
  for (const x of doMes(cls, mes)) s[new Date(`${x.data}T12:00:00Z`).getUTCDay()] += gasto(x);
  return s;
}

/** Maiores gastos do mês. */
export const maioresGastos = (cls: Classificada[], mes: string, n = 5) =>
  doMes(cls, mes).filter(x => x.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, n);

export interface Lugar { termo: string; desc: string; v: number; n: number }

/** Onde mais gastou: gastos agrupados pela parte fixa da descrição (sem números e códigos). */
export function lugares(cls: Classificada[], mes: string, n = 5): Lugar[] {
  const m = new Map<string, Lugar>();
  for (const x of doMes(cls, mes)) {
    const t = termoDe(x.desc) || norm(x.desc).trim();
    const l = m.get(t) || { termo: t, desc: x.desc, v: 0, n: 0 };
    l.v += gasto(x); l.n++;
    m.set(t, l);
  }
  return [...m.values()].filter(l => l.v > 0.005).sort((a, b) => b.v - a.v || b.n - a.n).slice(0, n);
}
