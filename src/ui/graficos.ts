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
 * Pizza em 3D: disco inclinado, fatias um pouco separadas (abrem quando o gráfico entra na tela,
 * ver animarGraficos), parede e cortes com sombra, brilho no topo e um anel tracejado embaixo.
 * A porcentagem vai escrita na fatia (o 3D engana o tamanho, o número não). Cada fatia é tocável
 * e abre o detalhe dela (data-ir). Partes pequenas ganham um mínimo para dar para tocar.
 * Ângulo 0 = fundo do disco (meio-dia), no sentido do relógio.
 */
export function pizza(partes: Parte[], opc: { larg?: number } = {}) {
  const ps = partes.filter(p => p.v > 0.005);
  const total = ps.reduce((a, p) => a + p.v, 0);
  if (total <= 0) return '';
  const W = opc.larg ?? 300, R = W / 2 - 22, k = 0.56, ry = R * k, h = R * 0.16, abre = 7;
  const cx = W / 2, cy = ry + 16, H = Math.ceil(cy + ry + h + 24);
  const id = `g3d${++seqGrafico}`;
  const n = (v: number) => v.toFixed(2);
  const P = (raio: number, a: number, dy = 0) => `${n(cx + raio * Math.sin(a))},${n(cy - raio * Math.cos(a) * k + dy)}`;
  const arco = (a0: number, a1: number, dy = 0, volta = false) =>
    `A${n(R)},${n(ry)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${volta ? 0 : 1} ${P(R, volta ? a0 : a1, dy)}`;
  const topo = (a0: number, a1: number) => `M${cx},${cy}L${P(R, a0)}${arco(a0, a1)}z`;
  // Parede de fora: só a metade da frente (90° a 270°) aparece.
  const parede = (a0: number, a1: number) => {
    const b0 = Math.max(a0, Math.PI / 2), b1 = Math.min(a1, 1.5 * Math.PI);
    return b1 - b0 > 0.001 ? `M${P(R, b0)}${arco(b0, b1)}L${P(R, b1, h)}${arco(b0, b1, h, true)}z` : '';
  };
  const borda = (a0: number, a1: number) => {
    const b0 = Math.max(a0, Math.PI / 2), b1 = Math.min(a1, 1.5 * Math.PI);
    return b1 - b0 > 0.001 ? `M${P(R, b0)}${arco(b0, b1)}` : '';
  };
  // Corte (lado da fatia), visível quando está virado para a frente.
  const corte = (a: number) => `M${cx},${cy}L${P(R, a)}L${P(R, a, h)}L${cx},${n(cy + h)}z`;
  const min = 0.02, peq = ps.filter(p => p.v / total < min).length;
  const escalaG = peq ? (1 - peq * min) / ps.filter(p => p.v / total >= min).reduce((a, p) => a + p.v / total, 0) : 1;
  const uma = ps.length === 1;
  let a = 0;
  const fatias = ps.map((p, i) => {
    const f = p.v / total, da = 2 * Math.PI * (f < min ? min : f * escalaG), a0 = a, a1 = a + da, m = a + da / 2;
    a = a1;
    return { p, i, f, a0, a1, m };
  });
  // Do fundo para a frente: o que está mais perto é desenhado por último.
  const g = fatias.slice().sort((x, y) => Math.cos(y.m) - Math.cos(x.m)).map(({ p, i, f, a0, a1, m }) => {
    const cortes = uma ? '' : [Math.cos(a0 - Math.PI / 2) < 0 ? corte(a0) : '', Math.cos(a1 + Math.PI / 2) < 0 ? corte(a1) : ''].join('');
    const fora = uma ? parede(Math.PI / 2, 1.5 * Math.PI) : parede(a0, a1);
    const sup = uma ? `M${cx - R},${cy}a${n(R)},${n(ry)} 0 1 0 ${n(2 * R)},0a${n(R)},${n(ry)} 0 1 0 ${n(-2 * R)},0z` : topo(a0, a1);
    const aro = uma ? borda(Math.PI / 2, 1.5 * Math.PI) : borda(a0, a1);
    const dx = uma ? 0 : Math.sin(m) * abre, dy = uma ? 0 : -Math.cos(m) * abre * k;
    const titulo = `${p.rotulo}: ${brl(p.v)} (${Math.round(f * 100)}%)`;
    const rotulo = f >= 0.05 ? `<text x="${n(cx + R * 0.6 * Math.sin(m))}" y="${n(cy - R * 0.6 * Math.cos(m) * k + 4)}" text-anchor="middle" font-size="12" font-weight="650" fill="#fff" stroke="rgba(8,12,20,.6)" stroke-width="3" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${Math.round(f * 100)}%</text>` : '';
    return `<g class="fatia${p.ir ? ' parte' : ''}"${p.ir ? ` data-ir="${esc(p.ir)}"` : ''} style="--dx:${n(dx)}px;--dy:${n(dy)}px;transition-delay:${i * 45}ms"><title>${esc(titulo)}</title>`
      + (cortes ? `<path d="${cortes}" fill="${p.cor}"/><path d="${cortes}" fill="#000" opacity=".42"/>` : '')
      + (fora ? `<path d="${fora}" fill="${p.cor}"/><path d="${fora}" fill="url(#${id}p)"/>` : '')
      + `<path d="${sup}" fill="${p.cor}"/><path d="${sup}" fill="url(#${id}b)" pointer-events="none"/>`
      + (aro ? `<path d="${aro}" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1" pointer-events="none"/>` : '')
      + `${rotulo}</g>`;
  }).join('');
  const anelR = R + 13;
  return `<div class="pizza3d"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(ps.map(p => `${p.rotulo} ${brl(p.v)}`).join(', '))}" font-family="inherit">
    <defs>
      <radialGradient id="${id}s"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}b" gradientUnits="userSpaceOnUse" cx="${n(cx - R * 0.35)}" cy="${n(cy - ry * 0.6)}" r="${n(R * 1.2)}"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".55" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>
      <linearGradient id="${id}p" gradientUnits="userSpaceOnUse" x1="${n(cx - R)}" x2="${n(cx + R)}" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".42" stop-color="#000" stop-opacity=".12"/><stop offset=".6" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient>
    </defs>
    <ellipse class="anel" cx="${cx}" cy="${n(cy + h + 2)}" rx="${n(anelR)}" ry="${n(anelR * k)}" fill="none" stroke="var(--tech)" stroke-width="1" stroke-dasharray="2 5"/>
    <ellipse cx="${cx}" cy="${n(cy + h + 4)}" rx="${n(R * 1.05)}" ry="${n(ry * 1.1)}" fill="url(#${id}s)"/>
    ${g}
  </svg></div>`;
}

let observador: IntersectionObserver | null = null;

/** Abre as pizzas (fatias separadas) quando entram na tela e fecha quando saem; chamado a cada redesenho. */
export function animarGraficos(raiz: ParentNode) {
  const els = Array.from(raiz.querySelectorAll<HTMLElement>('.pizza3d'));
  if (typeof IntersectionObserver === 'undefined') { els.forEach(e => e.classList.add('aberta')); return; }
  observador?.disconnect();
  observador = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('aberta', e.isIntersecting)), { threshold: 0.55 });
  els.forEach(e => observador!.observe(e));
}
