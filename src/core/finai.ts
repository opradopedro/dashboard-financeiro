// Formato "finai-banco/1", exatamente como definido no carteira (src/banco/arquivo.ts):
//
// {
//   "formato": "finai-banco/1",
//   "geradoEm": "2026-10-09T09:00:00-03:00",
//   "contas": [{ "id": "mercadopago-conta", "banco": "Mercado Pago", "nome": "Conta", "tipo": "corrente", "saldo": 132.35 }],
//   "transacoes": [{ "conta": "mercadopago-conta", "data": "2026-10-08", "descricao": "Dinheiro reservado", "valor": -300, "id": "opcional" }]
// }
// tipo: "corrente" ou "cartao". valor: negativo = saiu / gastou (inclusive compra no cartão);
// positivo = entrou (ou estorno/pagamento no cartão). O leitor do carteira também aceita
// "categoria" e "pendente" nas transações; a exportação daqui não usa esses dois.
import type { Conta, Transacao } from './tipos';
import { chavesDasLinhas, type LinhaBruta } from './juntar';
import { parseData, parseValor, slug } from './util';
import { saldoEstimado } from './classificar';

export const FORMATO = 'finai-banco/1';

export interface ArquivoFinai {
  formato: typeof FORMATO;
  geradoEm: string;
  contas: { id: string; banco: string; nome: string; tipo: 'corrente' | 'cartao'; saldo: number }[];
  transacoes: { conta: string; data: string; descricao: string; valor: number; id?: string }[];
}

/** ISO com o fuso do aparelho (ex.: 2026-10-09T09:00:00-03:00), como no exemplo do formato. */
export function isoLocal(d = new Date()) {
  const p = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}

/**
 * Exporta contas e transações. Saldo: o estimado a partir do saldo informado na conta (Ajustes →
 * Contas); sem ele, 0. Filtros opcionais por período (AAAA-MM-DD, inclusive).
 */
export function exportarFinai(contas: Conta[], txs: Transacao[], f: { de?: string; ate?: string } = {}, agora = new Date()): ArquivoFinai {
  const sel = txs.filter(t => (!f.de || t.data >= f.de) && (!f.ate || t.data <= f.ate)).sort((a, b) => a.data.localeCompare(b.data));
  return {
    formato: FORMATO,
    geradoEm: isoLocal(agora),
    contas: contas.map(c => ({ id: c.id, banco: c.banco, nome: c.nome, tipo: c.tipo, saldo: saldoEstimado(txs, c) ?? 0 })),
    transacoes: sel.map(t => ({ conta: t.conta, data: t.data, descricao: t.desc, valor: t.valor, id: t.id })),
  };
}

export interface LidoFinai {
  geradoEm: string;
  contas: Conta[];                          // contas citadas no arquivo (ids do arquivo)
  porConta: Map<string, LinhaBruta[]>;
  avisos: string[];
}

/** Lê e valida um arquivo finai-banco/1 (mesmas tolerâncias do leitor do carteira). */
export function lerFinai(texto: string): LidoFinai {
  let o: Record<string, unknown>;
  try { o = JSON.parse(texto); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  if (!o || typeof o !== 'object' || !Array.isArray(o.transacoes)) throw new Error('Este arquivo não está no formato finai-banco/1 (falta a lista "transacoes").');
  const geradoEm = typeof o.geradoEm === 'string' ? o.geradoEm : new Date().toISOString();
  const contas = new Map<string, Conta>();
  for (const c of Array.isArray(o.contas) ? o.contas as Record<string, unknown>[] : []) {
    if (!c || (typeof c.id !== 'string' && typeof c.nome !== 'string')) continue;
    const banco = String(c.banco || c.instituicao || 'Banco');
    const tipo = /cart|credit/i.test(String(c.tipo || '')) ? 'cartao' : 'corrente';
    const id = String(c.id || `${slug(banco)}-${tipo}`);
    contas.set(id, { id, banco, nome: String(c.nome || (tipo === 'cartao' ? 'Cartão' : 'Conta')), tipo, ativa: true });
  }
  const porConta = new Map<string, LinhaBruta[]>();
  let ruins = 0;
  for (const t of o.transacoes as Record<string, unknown>[]) {
    const d = parseData(t?.data ?? t?.date);
    const v = parseValor(t?.valor ?? t?.amount);
    const desc = String(t?.descricao ?? t?.description ?? '').trim();
    const conta = String(t?.conta ?? '');
    if (!d || !Number.isFinite(v) || !conta) { ruins++; continue; }
    if (!contas.has(conta)) contas.set(conta, { id: conta, banco: conta, nome: conta, tipo: /cart|credit/i.test(conta) ? 'cartao' : 'corrente', ativa: true });
    const l = porConta.get(conta) || [];
    l.push({ data: d, desc, valor: v, ...(t.id ? { id: String(t.id) } : {}) });
    porConta.set(conta, l);
  }
  const avisos = ruins ? [`${ruins} transação(ões) com data, valor ou conta faltando foram ignoradas.`] : [];
  return { geradoEm, contas: [...contas.values()], porConta, avisos };
}

/** Linhas do arquivo com chave estável, já com o id da conta deste app. */
export const linhasFinai = (conta: string, l: LinhaBruta[]) => chavesDasLinhas(conta, l);
