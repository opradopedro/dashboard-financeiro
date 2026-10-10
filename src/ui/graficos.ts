// Gráficos do Painel em SVG (sem biblioteca). Cores das categorias validadas para daltonismo no
// fundo escuro (6 cores; o resto vai para "outras", em cinza).
import { brl, compact, esc } from './fmt';

export const CORES_CAT = ['var(--cat1)', 'var(--cat2)', 'var(--cat3)', 'var(--cat4)', 'var(--cat5)', 'var(--cat6)'];
export const COR_OUTRAS = 'var(--cat-outras)';

/** Escala "redonda" do eixo: passo 1/2/5 × 10^n com cerca de 3 linhas. */
export function escala(max: number) {
  const m = Math.max(1, max);
  const p10 = Math.pow(10, Math.floor(Math.log10(m / 3))), f = m / 3 / p10;
  const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p10;
  return { passo, topo: Math.ceil(m / passo) * passo };
}

const largura = (el: HTMLElement) => Math.max(280, el.clientWidth || 320);

/**
 * Gasto acumulado dia a dia no mês (linha cheia), o mês anterior (tracejada) e, no mês atual,
 * a projeção até o fim no mesmo ritmo (pontilhada).
 */
export function graficoRitmo(el: HTMLElement, atual: number[], dias: number, anterior: number[], projecao: number | null, nomes: [string, string]) {
  const W = largura(el), H = 160, L = 40, R = 10, T = 10, B = 24;
  const n = atual.length;
  const visto = atual.slice(0, Math.max(1, dias));
  const { passo, topo } = escala(Math.max(...visto, ...anterior, projecao ?? 0));
  const X = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - v / topo) * (H - T - B);
  const caminho = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  let g = '';
  for (let v = 0; v <= topo + passo / 2; v += passo)
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--linha)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--grafite)">${compact(v)}</text>`;
  for (const d of [1, 10, 20, n]) g += `<text x="${X(d - 1).toFixed(1)}" y="${H - 6}" text-anchor="${d === 1 ? 'start' : d === n ? 'end' : 'middle'}" font-size="10.5" fill="var(--grafite)">${d}</text>`;
  if (anterior.length) g += `<path d="${caminho(anterior.slice(0, n))}" fill="none" stroke="var(--grafite)" stroke-width="1.5" stroke-dasharray="4 4" opacity=".8"><title>${nomes[1]}</title></path>`;
  const fim = visto.length - 1;
  g += `<path d="${caminho(visto)}L${X(fim).toFixed(1)},${Y(0)}L${X(0)},${Y(0)}z" fill="var(--saida)" opacity=".12"/>`;
  if (projecao != null && fim < n - 1) g += `<path d="M${X(fim).toFixed(1)},${Y(visto[fim]).toFixed(1)}L${X(n - 1).toFixed(1)},${Y(projecao).toFixed(1)}" stroke="var(--saida)" stroke-width="1.5" stroke-dasharray="1.5 4" stroke-linecap="round" opacity=".7"/>`;
  g += `<path d="${caminho(visto)}" fill="none" stroke="var(--saida)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><title>${nomes[0]}</title></path>`;
  g += `<circle cx="${X(fim).toFixed(1)}" cy="${Y(visto[fim]).toFixed(1)}" r="3.5" fill="var(--saida)" stroke="var(--lousa)" stroke-width="2"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto acumulado em ${nomes[0]}: ${brl(visto[fim])}" font-family="inherit">${g}</svg>`;
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Gasto por dia da semana, de segunda a domingo; o dia de maior gasto em destaque. Tocar abre o dia. */
export function graficoSemana(el: HTMLElement, s: number[], ir?: (dia: number) => string) {
  const W = largura(el), H = 120, T = 18, B = 22;
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const max = Math.max(...s), bw = W / 7, w = Math.min(28, bw * 0.55);
  const Y = (v: number) => T + (1 - (max ? v / max : 0)) * (H - T - B);
  let g = '';
  ordem.forEach((d, i) => {
    const v = s[d], x = i * bw + (bw - w) / 2, y = Y(v), h = H - B - y, topo = v === max && v > 0;
    if (v > 0) {
      const r = Math.min(4, w / 2, h);
      g += `<path d="M${x.toFixed(1)},${H - B}V${(y + r).toFixed(1)}q0,-${r} ${r},-${r}h${(w - 2 * r).toFixed(1)}q${r},0 ${r},${r}V${H - B}z" fill="var(--saida)" opacity="${topo ? 1 : 0.45}"><title>${DIAS_CURTOS[d]}: ${brl(v)}</title></path>`;
      if (topo) g += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="var(--papel)">${compact(v)}</text>`;
    } else g += `<line x1="${x.toFixed(1)}" x2="${(x + w).toFixed(1)}" y1="${H - B - 0.5}" y2="${H - B - 0.5}" stroke="var(--linha-forte)"/>`;
    g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="${topo ? 'var(--papel)' : 'var(--grafite)'}">${DIAS_CURTOS[d]}</text>`;
    if (ir && v > 0) g += `<rect x="${(i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}" fill="transparent" data-ir="${ir(d)}" class="parte"><title>${DIAS_CURTOS[d]}: ${brl(v)}</title></rect>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por dia da semana" font-family="inherit">${g}</svg>`;
}

export interface Parte { v: number; cor: string; rotulo: string; ir?: string }

/**
 * Rosca (ou pizza, com furo = 0): cada parte é tocável e abre o detalhe dela (data-ir). No meio
 * da rosca, o total e uma legenda curta. Partes pequenas ganham um mínimo para dar para tocar.
 */
export function rosca(partes: Parte[], centro?: { valor: string; legenda: string }, opc: { tam?: number; furo?: number } = {}) {
  const ps = partes.filter(p => p.v > 0.005);
  const total = ps.reduce((a, p) => a + p.v, 0);
  if (total <= 0) return '';
  const tam = opc.tam ?? 200, furo = opc.furo ?? 0.62;
  const c = tam / 2, R = c - 2, r = R * furo;
  // Mínimo de 2% do círculo por parte (o resto encolhe para caber).
  const min = 0.02, peq = ps.filter(p => p.v / total < min).length;
  const escalaG = peq ? (1 - peq * min) / ps.filter(p => p.v / total >= min).reduce((a, p) => a + p.v / total, 0) : 1;
  const ponto = (raio: number, a: number) => `${(c + raio * Math.sin(a)).toFixed(2)},${(c - raio * Math.cos(a)).toFixed(2)}`;
  const fatia = (a0: number, a1: number) => {
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    if (r <= 0) return `M${c},${c}L${ponto(R, a0)}A${R},${R} 0 ${grande} 1 ${ponto(R, a1)}z`;
    return `M${ponto(R, a0)}A${R},${R} 0 ${grande} 1 ${ponto(R, a1)}L${ponto(r, a1)}A${r},${r} 0 ${grande} 0 ${ponto(r, a0)}z`;
  };
  let a = 0, g = '';
  for (const p of ps) {
    const f = p.v / total, da = 2 * Math.PI * (f < min ? min : f * escalaG);
    // Uma parte só: círculo inteiro em duas metades (o arco SVG não fecha sozinho).
    const d = ps.length === 1 ? fatia(0, Math.PI) + fatia(Math.PI, 2 * Math.PI) : fatia(a, a + da);
    const titulo = `${p.rotulo}: ${brl(p.v)} (${Math.round(f * 100)}%)`;
    g += `<path d="${d}" fill="${p.cor}" stroke="var(--fundo-rosca, var(--noite))" stroke-width="${ps.length === 1 ? 0 : 2}" stroke-linejoin="round"${p.ir ? ` data-ir="${p.ir}" class="parte"` : ''}><title>${esc(titulo)}</title></path>`;
    a += da;
  }
  const meio = centro && r > 0 ? `<text x="${c}" y="${c - 2}" text-anchor="middle" pointer-events="none" font-size="${(tam / 13).toFixed(1)}" font-weight="500" fill="var(--papel)">${esc(centro.valor)}</text>
    <text x="${c}" y="${c + tam / 11}" text-anchor="middle" pointer-events="none" font-size="${(tam / 17).toFixed(1)}" fill="var(--grafite)">${esc(centro.legenda)}</text>` : '';
  return `<div class="rosca"><svg viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" role="img" aria-label="${esc(ps.map(p => `${p.rotulo} ${brl(p.v)}`).join(', '))}" font-family="inherit">${g}${meio}</svg></div>`;
}
