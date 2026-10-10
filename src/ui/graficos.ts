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

let seqGrafico = 0;

/**
 * Rosca (ou pizza, com furo = 0) em 3D: disco inclinado com parede, sombra e brilho; a
 * porcentagem vai escrita na fatia (o 3D engana o tamanho, o número não). Cada fatia (topo e
 * parede) é tocável e abre o detalhe dela (data-ir). Partes pequenas ganham um mínimo para dar
 * para tocar. Ângulo 0 = fundo do disco (meio-dia), no sentido do relógio.
 */
export function rosca(partes: Parte[], opc: { larg?: number; furo?: number } = {}) {
  const ps = partes.filter(p => p.v > 0.005);
  const total = ps.reduce((a, p) => a + p.v, 0);
  if (total <= 0) return '';
  const W = opc.larg ?? 280, furo = opc.furo ?? 0.5;
  const R = W / 2 - 6, k = 0.58, ry = R * k, h = R * 0.17, r = R * furo;
  const cx = W / 2, cy = ry + 6, H = Math.ceil(cy + ry + h + 12);
  const id = `g3d${++seqGrafico}`;
  const P = (raio: number, a: number, dy = 0) => `${(cx + raio * Math.sin(a)).toFixed(2)},${(cy - raio * Math.cos(a) * k + dy).toFixed(2)}`;
  const arco = (raio: number, a0: number, a1: number, dy = 0, volta = false) =>
    `A${raio.toFixed(2)},${(raio * k).toFixed(2)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${volta ? 0 : 1} ${P(raio, volta ? a0 : a1, dy)}`;
  // Topo da fatia (anel ou cunha).
  const topo = (a0: number, a1: number) => r > 0
    ? `M${P(R, a0)}${arco(R, a0, a1)}L${P(r, a1)}${arco(r, a0, a1, 0, true)}z`
    : `M${cx},${cy}L${P(R, a0)}${arco(R, a0, a1)}z`;
  // Parede: faixa entre o arco de cima e o mesmo arco h mais abaixo, só no trecho visível.
  const parede = (raio: number, a0: number, a1: number, de: number, ate: number) => {
    const b0 = Math.max(a0, de), b1 = Math.min(a1, ate);
    return b1 - b0 > 0.001 ? `M${P(raio, b0)}${arco(raio, b0, b1)}L${P(raio, b1, h)}${arco(raio, b0, b1, h, true)}z` : '';
  };
  const min = 0.02, peq = ps.filter(p => p.v / total < min).length;
  const escalaG = peq ? (1 - peq * min) / ps.filter(p => p.v / total >= min).reduce((a, p) => a + p.v / total, 0) : 1;
  const sep = ps.length > 1 ? 'stroke="var(--fundo-rosca, var(--noite))" stroke-width="1.5" stroke-linejoin="round"' : '';
  let a = 0, fatias = '', rotulos = '';
  for (const p of ps) {
    const f = p.v / total, da = 2 * Math.PI * (f < min ? min : f * escalaG), a1 = a + da;
    // A parede de fora aparece na metade da frente (90° a 270°); a de dentro, no fundo do furo.
    const fora = parede(R, a, a1, Math.PI / 2, 1.5 * Math.PI);
    const dentro = r > 0 ? parede(r, a, a1, 0, Math.PI / 2) + parede(r, a, a1, 1.5 * Math.PI, 2 * Math.PI) : '';
    const sup = ps.length === 1 ? topo(0, Math.PI) + topo(Math.PI, 2 * Math.PI) : topo(a, a1);
    const titulo = `${p.rotulo}: ${brl(p.v)} (${Math.round(f * 100)}%)`;
    fatias += `<g${p.ir ? ` data-ir="${esc(p.ir)}" class="parte"` : ''}><title>${esc(titulo)}</title>`
      + (dentro ? `<path d="${dentro}" fill="${p.cor}"/><path d="${dentro}" fill="#000" opacity=".5"/>` : '')
      + (fora ? `<path d="${fora}" fill="${p.cor}" ${sep}/><path d="${fora}" fill="#000" opacity=".3"/>` : '')
      + `<path d="${sup}" fill="${p.cor}" ${sep}/></g>`;
    if (f >= 0.05) {
      const m = a + da / 2, rr = r > 0 ? (R + r) / 2 : R * 0.64;
      rotulos += `<text x="${(cx + rr * Math.sin(m)).toFixed(1)}" y="${(cy - rr * Math.cos(m) * k + 4).toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="650" fill="#fff" stroke="rgba(8,12,20,.55)" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${Math.round(f * 100)}%</text>`;
    }
    a = a1;
  }
  // Furo e brilho só no topo (evenodd recorta o furo).
  const disco = `M${cx - R},${cy}a${R},${ry} 0 1 0 ${2 * R},0a${R},${ry} 0 1 0 ${-2 * R},0z`
    + (r > 0 ? `M${cx - r},${cy}a${r},${r * k} 0 1 0 ${2 * r},0a${r},${r * k} 0 1 0 ${-2 * r},0z` : '');
  const faixa = `M${cx - R},${cy}A${R},${ry} 0 0 0 ${cx + R},${cy}L${cx + R},${cy + h}A${R},${ry} 0 0 1 ${cx - R},${cy + h}z`;
  return `<div class="rosca"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(ps.map(p => `${p.rotulo} ${brl(p.v)}`).join(', '))}" font-family="inherit">
    <defs>
      <radialGradient id="${id}s"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}b" cx=".35" cy=".2" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}p"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>
    </defs>
    <ellipse cx="${cx}" cy="${(cy + h + 3).toFixed(1)}" rx="${(R * 1.04).toFixed(1)}" ry="${(ry * 1.08).toFixed(1)}" fill="url(#${id}s)"/>
    ${fatias}
    <path d="${faixa}" fill="url(#${id}p)" pointer-events="none"/>
    <path d="${disco}" fill="url(#${id}b)" fill-rule="evenodd" pointer-events="none"/>
    <g pointer-events="none">${rotulos}</g>
  </svg></div>`;
}
