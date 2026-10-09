// Mapeamento de colunas de CSV/Excel: sugere qual coluna é data, descrição e valor, gera a
// pré-visualização e converte em linhas de extrato. O mapeamento pode ser salvo como modelo da conta.
import type { Mapeamento, ModeloImport } from '../core/tipos';
import type { LinhaBruta } from '../core/juntar';
import { norm, parseData, parseValor } from '../core/util';
import type { Celula } from './planilha';

const RE_DATA = / (data|dt|date|dia) /;
const RE_DESC = / (descricao|historico|lancamento|estabelecimento|description|title|memo|detalhe|detalhes|titulo|identificacao|nome|movimentacao|movimento) /;
const RE_SALDO = / (saldo|balance) /;
const RE_PARCELA = / (parcela|parcelas|installment) /;
const RE_VALOR = / (valor|value|amount|quantia|montante|valor r|valor rs|total) /;
const RE_CRED = / (credito|creditos|entrada|entradas|credit) /;
const RE_DEB = / (debito|debitos|saida|saidas|debit) /;

const txt = (c: Celula | undefined) => (c == null ? '' : String(c));

/** Assinatura do cabeçalho (para achar o modelo salvo certo da próxima vez). */
export const assinatura = (rows: Celula[][], linhaCab: number) =>
  linhaCab < 0 ? `sem-cabecalho:${rows[0]?.length || 0}` : (rows[linhaCab] || []).map(c => norm(txt(c)).trim()).join('|');

/** Procura a linha de cabeçalho nas primeiras 30 linhas: a primeira com data e valor nos nomes. */
export function acharCabecalho(rows: Celula[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const ns = rows[i].map(c => norm(txt(c)));
    if (ns.some(n => RE_DATA.test(n)) && ns.some(n => RE_VALOR.test(n) || RE_CRED.test(n) || RE_DEB.test(n))) return i;
  }
  return -1;
}

/** Sugestão de mapeamento: pelo nome das colunas e, sem cabeçalho, pelo conteúdo. */
export function sugerirMapeamento(rows: Celula[][]): Mapeamento {
  const linhaCab = acharCabecalho(rows);
  const m: Mapeamento = { linhaCab, colData: -1, colDesc: -1, colDesc2: -1, colValor: -1, colCredito: -1, colDebito: -1, colSaldo: -1, inverter: false, formatoData: 'auto' };
  if (linhaCab >= 0) {
    const ns = rows[linhaCab].map(c => norm(txt(c)));
    const acha = (re: RegExp, fora: number[] = []) => ns.findIndex((n, i) => re.test(n) && !fora.includes(i));
    m.colData = acha(RE_DATA);
    m.colSaldo = acha(RE_SALDO);
    m.colValor = acha(RE_VALOR, [m.colData, m.colSaldo]);
    m.colDesc = acha(RE_DESC, [m.colData, m.colValor]);
    if (m.colValor < 0) { m.colCredito = acha(RE_CRED, [m.colData]); m.colDebito = acha(RE_DEB, [m.colData]); }
    // Parcela vai junto da descrição: a mesma compra parcelada aparece em várias faturas.
    m.colDesc2 = acha(RE_PARCELA, [m.colData, m.colDesc, m.colValor]);
  }
  // Pelo conteúdo: coluna com mais datas, coluna com mais valores, coluna de texto mais longo.
  const dados = rows.slice(linhaCab + 1, linhaCab + 30);
  const ncol = Math.max(0, ...dados.map(r => r.length));
  const conta = (f: (c: Celula) => boolean) => Array.from({ length: ncol }, (_, i) => dados.filter(r => f(r[i] ?? '')).length);
  if (m.colData < 0) { const n = conta(c => !!parseData(c)); m.colData = n.indexOf(Math.max(...n)); }
  if (m.colValor < 0 && m.colCredito < 0 && m.colDebito < 0) {
    const n = conta(c => txt(c) !== '' && Number.isFinite(parseValor(c)) && !parseData(c));
    n[m.colData] = -1;
    if (m.colSaldo >= 0) n[m.colSaldo] = -1;
    m.colValor = n.indexOf(Math.max(...n));
  }
  if (m.colDesc < 0) {
    const tam = Array.from({ length: ncol }, (_, i) => dados.reduce((s, r) => s + (Number.isFinite(parseValor(r[i])) ? 0 : txt(r[i]).length), 0));
    for (const i of [m.colData, m.colValor, m.colCredito, m.colDebito, m.colSaldo]) if (i >= 0) tam[i] = -1;
    m.colDesc = tam.indexOf(Math.max(...tam));
  }
  return m;
}

/** Usa o modelo salvo da conta cujo cabeçalho é igual ao deste arquivo, se houver. */
export function modeloPara(modelos: ModeloImport[], conta: string, rows: Celula[][]): ModeloImport | null {
  return modelos.find(md => md.conta === conta && assinatura(rows, md.linhaCab) === md.assinatura) || null;
}

export interface Convertido { linhas: LinhaBruta[]; ignoradas: { linha: number; motivo: string }[] }

/** Aplica o mapeamento. Linhas sem data ou valor válidos são listadas como ignoradas (ex.: totais, saldo). */
export function aplicarMapeamento(rows: Celula[][], m: Mapeamento): Convertido {
  const out: Convertido = { linhas: [], ignoradas: [] };
  rows.forEach((r, i) => {
    if (i <= m.linhaCab) return;
    const data = parseData(r[m.colData] ?? '', m.formatoData);
    let valor: number;
    if (m.colValor >= 0) valor = parseValor(r[m.colValor]);
    else {
      const c = m.colCredito >= 0 && txt(r[m.colCredito]) !== '' ? Math.abs(parseValor(r[m.colCredito])) : 0;
      const d = m.colDebito >= 0 && txt(r[m.colDebito]) !== '' ? Math.abs(parseValor(r[m.colDebito])) : 0;
      valor = Number.isFinite(c) && Number.isFinite(d) && (c || d) ? c - d : NaN;
    }
    // Complemento vazio ou sem informação ("-", "de 1") não entra.
    const comp = m.colDesc2 >= 0 ? txt(r[m.colDesc2]).trim() : '';
    const desc = [txt(r[m.colDesc]).trim(), /^(-+|de\s+\d+|0)?$/i.test(comp) ? '' : comp].filter(Boolean).join(' - ');
    if (!data) { if (r.some(c => txt(c) !== '')) out.ignoradas.push({ linha: i + 1, motivo: 'sem data' }); return; }
    if (!Number.isFinite(valor) || valor === 0) { out.ignoradas.push({ linha: i + 1, motivo: 'sem valor' }); return; }
    if (/^(saldo|total|saldo anterior|saldo do dia|saldo final)\b/i.test(norm(desc).trim())) { out.ignoradas.push({ linha: i + 1, motivo: 'linha de saldo/total' }); return; }
    const saldo = m.colSaldo >= 0 && txt(r[m.colSaldo]) !== '' ? parseValor(r[m.colSaldo]) : NaN;
    out.linhas.push({ data, desc, valor: m.inverter ? -valor : valor, ...(Number.isFinite(saldo) ? { saldo } : {}) });
  });
  return out;
}
