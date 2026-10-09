export const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll(s)] as T[];

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const compactFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl = (v: number) => brlFmt.format(v);
export const compact = (v: number) => compactFmt.format(v);
export const fmtNum = (v: number) => num2.format(v);
/** +R$ 10,00 / −R$ 10,00 */
export const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + brlFmt.format(Math.abs(v));

export const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** AAAA-MM-DD → dd/mm/aaaa */
export const fmtD = (s: string) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
export const fmtYm = (ym: string) => MES[parseInt(ym.slice(5, 7), 10) - 1] + '/' + ym.slice(0, 4);
export const mesLongo = (ym: string) => `${MES_LONGO[parseInt(ym.slice(5, 7), 10) - 1]} de ${ym.slice(0, 4)}`;
/** epoch ms → dd/mm/aaaa hh:mm */
export const fmtQuando = (ms: number) => {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

let toastT = 0;
export function toast(msg: string) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => (t.hidden = true), 3500);
}

export const opcoes = (lista: { v: string; t: string }[], sel?: string) =>
  lista.map(o => `<option value="${esc(o.v)}"${o.v === sel ? ' selected' : ''}>${esc(o.t)}</option>`).join('');

/** Lê um arquivo escolhido pelo usuário. */
export const lerArquivo = (f: File) => f.arrayBuffer();
