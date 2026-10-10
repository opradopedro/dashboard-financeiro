// Gráficos do Painel em SVG (sem biblioteca). Cores das categorias validadas para daltonismo no
// fundo escuro (6 cores; o resto vai para "outras", em cinza).
import { brl, compact } from './fmt';

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

/** Gasto por dia da semana, de segunda a domingo; o dia de maior gasto em destaque. */
export function graficoSemana(el: HTMLElement, s: number[]) {
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
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por dia da semana" font-family="inherit">${g}</svg>`;
}

/** Fita empilhada (parte do todo), com um pequeno vão entre as partes. */
export function fitaEmpilhada(partes: { v: number; cor: string; rotulo: string }[]) {
  const total = partes.reduce((a, p) => a + p.v, 0);
  if (total <= 0) return '';
  return `<div class="fita-cats" role="img" aria-label="${partes.map(p => `${p.rotulo} ${brl(p.v)}`).join(', ')}">${partes
    .map(p => `<i style="flex-grow:${(p.v / total * 1000).toFixed(0)};background:${p.cor}"></i>`).join('')}</div>`;
}
