// Funções pequenas e puras usadas em todo o app.

/** Texto sem acento, minúsculo e com espaços simples, com um espaço em cada ponta (para comparar descrições). */
export const norm = (s: string) =>
  ` ${s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim()} `;

/** Parte "fixa" da descrição, usada nas regras ("aplicar às parecidas"): sem números, datas e códigos. */
export function termoDe(desc: string): string {
  return norm(desc).replace(/\b[a-z]*\d\w*\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 4).join(' ');
}

let seq = 0;
export const uid = (p = '') => p + Date.now().toString(36) + (++seq).toString(36) + Math.random().toString(36).slice(2, 7);

export const arred = (v: number) => Math.round(v * 100) / 100;

/**
 * Valor em reais escrito de vários jeitos: "1.234,56", "-1234.56", "R$ 12,34", "(12,34)", "12,34-",
 * "- R$ 5,00", "12,34 D" (débito) / "12,34 C" (crédito). Devolve NaN se não for número.
 */
export function parseValor(v: unknown): number {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/ /g, ' ');
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const dc = /\s*([DC])$/i.exec(s);
  if (dc) { if (dc[1].toUpperCase() === 'D') neg = !neg; s = s.slice(0, dc.index); }
  if (/-\s*$/.test(s)) { neg = !neg; s = s.replace(/-\s*$/, ''); }
  s = s.replace(/R\$|\s/gi, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return NaN;
  let n: number;
  if (/,\d{1,2}$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));          // 1.234,56
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ''));            // 1.234
  else n = Number(s.replace(/,/g, ''));                                                // 1234.56 / 1,234.56
  return neg ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, '0');
const valida = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const ano4 = (y: number) => (y < 100 ? 2000 + y : y);

export type FormatoData = 'auto' | 'dmy' | 'ymd' | 'mdy';

/** Data em AAAA-MM-DD a partir de "dd/mm/aaaa", "aaaa-mm-dd", "dd/mm/aa", "dd-mm-aaaa", "20261009", Date ou número de série do Excel. */
export function parseData(v: unknown, formato: FormatoData = 'auto'): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) { // série do Excel (dias desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m && formato !== 'dmy' && formato !== 'mdy') return valida(+m[1], +m[2], +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})(?:\d{6})?(?:\.\d+)?(?:\[.*\])?$/.exec(s); // OFX: 20261009 ou 20261009120000[-3:BRT]
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(s);
  if (m) return formato === 'mdy' ? valida(ano4(+m[3]), +m[1], +m[2]) : valida(ano4(+m[3]), +m[2], +m[1]);
  return null;
}

/** Data local (do aparelho) de um instante, em AAAA-MM-DD. */
export const dataLocal = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const hoje = () => dataLocal(Date.now());

export const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

export function somaDias(d: string, n: number) {
  const t = new Date(Date.parse(d) + n * 864e5);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function somaMes(ym: string, n: number) {
  let [y, m] = ym.split('-').map(Number);
  m += n;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return `${y}-${pad(m)}`;
}

/** Nome curto para id (sem acento, minúsculo, com hífens). */
export const slug = (s: string) => norm(s).trim().replace(/\s+/g, '-') || 'conta';
