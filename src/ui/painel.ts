// Painel (adaptado do carteira, src/ui/banco.ts): entradas e saídas reais do mês, gastos por
// categoria, gráfico de 12 meses e o que precisa de atenção.
import { classificadas, mudar, nomeConta, state } from '../app';
import { sugerirTitular } from '../core/sugestoes';
import { nReembolsosPendentes } from './reembolsos';
import { mesDaFatura, resumoMes, saldoEstimado, serieMeses, SEM_CATEGORIA, type Classificada } from '../core/classificar';
import { FORMAS, lugares, maioresGastos, porConta, porDiaSemana, porForma, recortar, ritmo, acumulado, type Fatia, type Forma, type Recorte } from '../core/indicadores';
import { TIPOS, contaNoTotal } from '../core/tipos';
import { hoje, somaDias, somaMes } from '../core/util';
import { brl, compact, esc, fmtD, fmtNum, fmtYm, MES, mesLongo, sinal, toast } from './fmt';
import { COR_OUTRAS, CORES_CAT, graficoRitmo, graficoSemana, mostradorHud, pizza } from './graficos';
import { trocar } from './nav';
import { botaoFiltro, clsFiltradas, filtroAtivo, ligarFiltro, linhaFiltro } from './filtro';
import { ICONES } from './icones';

// Mês aberto nas telas (só na memória: ao abrir o app, volta para o mês atual).
let mesSel: string | null = null;
// Lista mostrada em "Maiores gastos" / "Onde mais gastou".
let vistaTop: 'maiores' | 'lugares' = 'maiores';
const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const nomeMes = (ym: string) => mesLongo(ym).split(' de ')[0];

/** Cor de cada categoria de gasto: as 6 maiores com cor própria, o resto (e "sem categoria") em cinza. */
function coresCategorias(cats: { cat: string }[]) {
  const m = new Map<string, string>();
  let i = 0;
  for (const c of cats) m.set(c.cat, c.cat !== SEM_CATEGORIA && i < CORES_CAT.length ? CORES_CAT[i++] : COR_OUTRAS);
  return m;
}
export const mesAtual = () => mesSel || hoje().slice(0, 7);

/** Cor fixa de cada forma de pagamento (a mesma em todas as telas). */
const COR_FORMA: Record<Forma, string> = {
  credito: CORES_CAT[0], pix: CORES_CAT[1], debito: CORES_CAT[2], vale: CORES_CAT[3], boleto: CORES_CAT[4], transferencia: CORES_CAT[5], saque: COR_OUTRAS,
};

interface Parte { rotulo: string; v: number; n: number; cor: string; ir: string }

/**
 * Pizza 3D + lista: cada fatia e cada linha abrem o detalhe daquela parte.
 * `unidade` = singular e plural do que é contado (gasto/gastos, entrada/entradas).
 */
function blocoPartes(ps: Parte[], total: number, opc: { unidade: [string, string] }) {
  if (!ps.length) return '';
  const maior = ps[0].v || 1;
  const grafico = pizza(ps.map(p => ({ v: p.v, cor: p.cor, rotulo: p.rotulo, ir: p.ir })));
  return `${grafico}<div class="folha"><div class="list">${ps.map(p => `<button type="button" class="item cat-linha" data-ir="${esc(p.ir)}">
      <div class="name">${esc(p.rotulo)}</div><div class="val">${brl(p.v)}</div>
      <div class="barra"><i style="width:${Math.max(2, p.v / maior * 100).toFixed(1)}%;background:${p.cor}"></i></div>
      <div class="meta">${p.n === 1 ? `1 ${opc.unidade[0]}` : `${p.n} ${opc.unidade[1]}`}</div><div class="meta r">${total > 0 ? fmtNum(p.v / total * 100) + '%' : ''}</div></button>`).join('')}</div></div>`;
}

/** Partes por categoria (cores pela ordem: as 6 maiores com cor própria). */
function partesCat(cats: { cat: string; v: number; n: number }[], ir: (cat: string) => string): Parte[] {
  const cores = coresCategorias(cats);
  return cats.map(c => ({ rotulo: c.cat, v: c.v, n: c.n, cor: cores.get(c.cat)!, ir: ir(c.cat) }));
}
const partesForma = (fs: Fatia<Forma>[], ir: (f: Forma) => string): Parte[] =>
  fs.map(f => ({ rotulo: FORMAS[f.chave], v: f.v, n: f.n, cor: COR_FORMA[f.chave], ir: ir(f.chave) }));
const partesConta = (fs: Fatia[], ir: (c: string) => string): Parte[] =>
  fs.map((f, i) => ({ rotulo: nomeConta(f.chave), v: f.v, n: f.n, cor: CORES_CAT[i] || COR_OUTRAS, ir: ir(f.chave) }));
const irCat = (cat: string) => `cat/${encodeURIComponent(cat)}`;

/** Rota da tela de detalhe de um recorte (`nome` = como mostrar um lugar). */
export function rotaDetalhe(r: Recorte, nome = '') {
  const q = new URLSearchParams();
  if (r.forma) q.set('forma', r.forma);
  if (r.conta) q.set('conta', r.conta);
  if (r.lugar != null) q.set('lugar', r.lugar);
  if (r.dia != null) q.set('dia', String(r.dia));
  if (r.cat != null) q.set('cat', r.cat);
  if (nome) q.set('nome', nome);
  // Só categoria: a tela da categoria (mesma tela, rota curta).
  return Object.keys(r).filter(k => (r as Record<string, unknown>)[k] != null).join() === 'cat' ? irCat(r.cat!) : `detalhe?${q}`;
}

export function recorteDe(q: URLSearchParams): Recorte {
  const r: Recorte = {};
  if (q.get('forma') && q.get('forma')! in FORMAS) r.forma = q.get('forma') as Forma;
  if (q.get('conta')) r.conta = q.get('conta')!;
  if (q.has('lugar')) r.lugar = q.get('lugar')!;
  if (q.get('dia') && /^[0-6]$/.test(q.get('dia')!)) r.dia = Number(q.get('dia'));
  if (q.has('cat')) r.cat = q.get('cat')!;
  return r;
}

const DIAS_PLURAL = ['Domingos', 'Segundas', 'Terças', 'Quartas', 'Quintas', 'Sextas', 'Sábados'];

/** Título do detalhe: "Pix", "Flash", "Sábados", "Mercado, Crédito"… */
export function tituloRecorte(r: Recorte, nome = '') {
  return [r.cat, r.lugar != null ? nome || r.lugar : '', r.forma ? FORMAS[r.forma] : '', r.conta ? nomeConta(r.conta) : '', r.dia != null ? DIAS_PLURAL[r.dia] : '']
    .filter(Boolean).join(', ') || 'Detalhe';
}

const ehEntrada = (x: Classificada) => x.t === 'entrada' || (x.t === 'saida' && x.valor > 0);

export function itemTx(x: Classificada, comData = false) {
  const conta = contaNoTotal(x.t);
  const rotulo = conta ? (x.c || SEM_CATEGORIA) : TIPOS[x.t];
  const inicial = (conta ? x.c || '?' : TIPOS[x.t]).trim().charAt(0).toUpperCase();
  const marca = conta ? (x.c ? (ehEntrada(x) ? 'e' : 's') : 'sem') : '';
  const orig = x.origens.map(o => ORIGEM_CURTA[o.tipo]).filter((v, i, a) => a.indexOf(v) === i).join(' + ');
  return `<button type="button" class="item tx${conta ? '' : ' fora'}" data-ir="tx/${esc(x.id)}">
    <span class="marca ${marca}" aria-hidden="true">${esc(inicial)}</span>
    <div class="name">${esc(x.desc)}</div>
    <div class="val">${sinal(x.valor)}</div>
    <div class="meta">${esc(rotulo)}, ${esc(nomeConta(x.conta))}${comData ? `, ${fmtD(x.data)}` : ''}</div>
    <div class="meta r">${orig}</div></button>`;
}
const ORIGEM_CURTA = { notificacao: 'notificação', extrato: 'extrato', manual: 'manual' } as const;

/** Lista agrupada por dia ("hoje", "ontem", "qua., 8 de out."). */
export function listaPorDia(xs: Classificada[]) {
  let out = '', dia = '';
  for (const x of xs) {
    if (x.data !== dia) { dia = x.data; out += `<div class="dia">${nomeDia(dia)}</div>`; }
    out += itemTx(x);
  }
  return out;
}

const DIAS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
export function nomeDia(d: string) {
  const h = hoje();
  if (d === h) return 'Hoje';
  if (d === somaDias(h, -1)) return 'Ontem';
  const dt = new Date(`${d}T12:00:00`);
  return `${DIAS[dt.getDay()]}, ${dt.getDate()} de ${MES[dt.getMonth()]}${d.slice(0, 4) === h.slice(0, 4) ? '' : ` de ${d.slice(0, 4)}`}`;
}

/** Barras de entradas x saídas por mês (SVG; cores validadas para daltonismo). Tocar num mês abre o mês. */
export function graficoMeses(el: HTMLElement, s: { mes: string; entradas: number; saidas: number }[], atual: string) {
  const W = Math.max(280, el.clientWidth || 320), H = 170, L = 40, R = 4, T = 8, B = 24;
  const max = Math.max(1, ...s.flatMap(x => [x.entradas, x.saidas]));
  const p10 = Math.pow(10, Math.floor(Math.log10(max / 3))), f = max / 3 / p10;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p10, y1 = Math.ceil(max / step) * step;
  const Y = (v: number) => T + (1 - v / y1) * (H - T - B), bw = (W - L - R) / s.length;
  const barra = (x: number, v: number, w: number, cor: string, op: number) => {
    const y = Y(v), h = Y(0) - y, r = Math.min(4, w / 2, h);
    return `<path d="M${x.toFixed(1)},${Y(0).toFixed(1)}V${(y + r).toFixed(1)}q0,-${r} ${r},-${r}h${(w - 2 * r).toFixed(1)}q${r},0 ${r},${r}V${Y(0).toFixed(1)}z" fill="${cor}" opacity="${op}"/>`;
  };
  let g = '';
  for (let v = 0; v <= y1 + step / 2; v += step)
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--linha)" stroke-width="1"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--grafite)">${compact(v)}</text>`;
  s.forEach((x, i) => {
    const w = Math.min(14, bw * 0.3), x0 = L + i * bw + bw / 2 - w - 1, op = x.mes === atual ? 1 : 0.45;
    if (x.entradas > 0) g += barra(x0, x.entradas, w, 'var(--entrada)', op);
    if (x.saidas > 0) g += barra(x0 + w + 2, x.saidas, w, 'var(--saida)', op);
    if ((s.length - 1 - i) % 2 === 0) g += `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10.5" fill="var(--grafite)">${MES[parseInt(x.mes.slice(5), 10) - 1]}</text>`;
    g += `<rect x="${(L + i * bw).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - B}" fill="transparent" data-mes-ir="${x.mes}" class="parte"><title>${fmtYm(x.mes)}: entradas ${brl(x.entradas)}, saídas ${brl(x.saidas)}</title></rect>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por mês" font-family="inherit">${g}</svg>`;
}

/** Cabeçalho de mês: o nome do mês é o título da tela. */
export function navMes(mes: string, extra = '') {
  const fim = hoje().slice(0, 7);
  const nome = mesLongo(mes).split(' de ');
  return `<div class="fita-mes">
    <h2>${nome[0]}${nome[1] !== fim.slice(0, 4) ? `<small>${nome[1]}</small>` : ''}</h2>
    <div class="setas">${extra}
      <button type="button" data-mes-mudar="-1" aria-label="Mês anterior">${ICONES.antes}</button>
      <button type="button" data-mes-mudar="1" aria-label="Próximo mês"${mes >= fim ? ' disabled' : ''}>${ICONES.depois}</button>
    </div>
  </div>`;
}

export function telaPainel(el: HTMLElement) {
  const d = state.dados;
  const cls = clsFiltradas();
  const filtro = filtroAtivo();
  const mes = mesAtual();
  const r = resumoMes(cls, mes);
  const n = state.nativo;
  const semRegra = d.notifs.filter(x => x.status === 'sem-regra' || x.status === 'erro').length;
  const avisos: string[] = [];
  if (n && !n.web && !n.acessoPermitido) avisos.push(`<button type="button" class="aviso" data-ir="boasvindas">A captura de notificações está desligada. Toque para liberar.</button>`);
  if (d.revisoes.length) avisos.push(`<button type="button" class="aviso" data-ir="revisao">${d.revisoes.length === 1 ? '1 linha de extrato espera' : `${d.revisoes.length} linhas de extrato esperam`} sua revisão</button>`);
  const nReemb = nReembolsosPendentes();
  if (nReemb) avisos.push(`<button type="button" class="aviso leve" data-ir="reembolsos">${nReemb === 1 ? '1 entrada pode ser' : `${nReemb} entradas podem ser`} reembolso de um gasto</button>`);
  const nomeSug = d.config.titular ? null : sugerirTitular(d.txs);
  if (nomeSug) avisos.push(`<div class="aviso aviso-acao"><span>Seu nome nos bancos é <b>${esc(nomeSug)}</b>? Com ele, o Pix que chega no seu nome conta como salário e o que você manda para você mesmo não conta como gasto.</span>
    <div class="row"><button type="button" class="btn small primary" data-titular="${esc(nomeSug)}">Sim, sou eu</button><button type="button" class="btn small" data-ir="ajustes">Outro nome</button></div></div>`);
  if (semRegra) avisos.push(`<button type="button" class="aviso leve" data-aba="notificacoes?status=sem-regra">${semRegra === 1 ? '1 notificação está' : `${semRegra} notificações estão`} sem regra</button>`);
  const total = r.entradas + r.saidas;
  const pe = total > 0 ? (r.entradas / total) * 100 : 50;
  // Pagamento de fatura fica fora da conta (o gasto já contou na compra) e não aparece aqui.
  const fora = [r.fora.caixinha && `caixinha ${brl(r.fora.caixinha)}`, r.fora.interna && `transferências entre suas contas ${brl(r.fora.interna)}`].filter(Boolean);
  const rt = ritmo(cls, mes, hoje());
  const formas = porForma(cls, d.contas, mes);
  const gastoConta = new Map(porConta(cls, mes).map(f => [f.chave, f.v]));
  const maiorConta = Math.max(1, ...gastoConta.values());
  const semana = porDiaSemana(cls, mes);
  const diaTop = semana.indexOf(Math.max(...semana));
  const maiores = maioresGastos(cls, mes, 5), onde = lugares(cls, mes, 5);
  const ant = nomeMes(somaMes(mes, -1));
  const fraseRitmo = rt.variacao == null ? '' : Math.abs(rt.variacao) < 0.01 ? `O mesmo que em ${ant} até o dia ${rt.dias}.`
    : `${pct(Math.abs(rt.variacao))} ${rt.variacao < 0 ? 'a menos' : 'a mais'} que em ${ant} até o dia ${rt.dias}.`;
  const frase = !total ? 'Nada entrou nem saiu neste mês ainda.'
    : r.saldo >= 0 ? `Sobrou <b>${brl(r.saldo)}</b> do que entrou.` : `Saiu <b>${brl(-r.saldo)}</b> a mais do que entrou.`;

  el.innerHTML = `
  <section class="fita">
    ${mostradorHud()}
    ${navMes(mes, botaoFiltro())}
    ${linhaFiltro()}
    <p class="frase">${frase}</p>
    ${total ? `<div class="barra-dupla" role="img" aria-label="Entradas ${brl(r.entradas)}, saídas ${brl(r.saidas)}">${r.entradas ? `<i class="e" style="width:${pe.toFixed(1)}%"></i>` : ''}${r.saidas ? `<i class="s" style="width:${(100 - pe).toFixed(1)}%"></i>` : ''}</div>` : ''}
    <div class="fita-valores">
      <button type="button" data-ir="movimentos/entrada"><span><i class="ponto e"></i>Entradas</span><b>${brl(r.entradas)}</b></button>
      <button type="button" data-ir="movimentos/saida"><span><i class="ponto s"></i>Saídas</span><b>${brl(r.saidas)}</b></button>
    </div>
    ${fora.length ? `<button type="button" class="nota-fora" data-ir="fora/${mes}">Fora da conta, por ser dinheiro seu mudando de lugar: ${fora.join(', ')}. <u>Ver quais</u></button>` : ''}
  </section>

  ${avisos.length ? `<div class="panel">${avisos.join('')}</div>` : ''}

  <section class="panel">
    <div class="row between"><h2>Para onde foi</h2><span class="sub">${brl(r.saidas)}</span></div>
    ${r.porCategoria.length ? blocoPartes(partesCat(r.porCategoria, irCat), r.saidas, { unidade: ['transação', 'transações'] }) : '<div class="empty">Nenhum gasto neste mês.</div>'}
    ${r.semCategoria ? `<button type="button" class="btn small" data-ir="semcat/${mes}">Categorizar ${r.semCategoria === 1 ? '1 transação' : `${r.semCategoria} transações`}</button>` : ''}
  </section>

  ${rt.total > 0 || rt.anterior > 0 ? `<section class="panel">
    <h2>Ritmo do mês</h2>
    <div class="caixa tocavel" data-ir="movimentos/saida" role="button" aria-label="Ver as saídas do mês">
      <div class="stats">
        <div><span class="label">Por dia</span><b class="lg">${brl(rt.porDia)}</b></div>
        <div><span class="label">${rt.projecao != null ? 'Até agora' : 'No mês'}</span><b class="lg">${brl(rt.total)}</b></div>
        ${rt.projecao != null ? `<div><span class="label">Deve fechar em</span><b class="lg">${brl(rt.projecao)}</b></div>`
          : `<div><span class="label">Em ${ant}</span><b class="lg">${brl(rt.anterior)}</b></div>`}
      </div>
      <div id="chRitmo" class="chart"></div>
      <div class="legenda"><span><i class="traco"></i>${nomeMes(mes)}</span><span><i class="traco ant"></i>${ant}</span>${rt.projecao != null ? '<span><i class="traco proj"></i>no mesmo ritmo</span>' : ''}</div>
      ${fraseRitmo ? `<p class="sub">${fraseRitmo}</p>` : ''}
    </div>
  </section>` : ''}

  ${formas.length ? `<section class="panel">
    <h2>Como pagou</h2>
    ${blocoPartes(partesForma(formas, f => rotaDetalhe({ forma: f })), r.saidas, { unidade: ['gasto', 'gastos'] })}
    <p class="note">Pela conta (cartão = crédito; vale = conta de benefício) e pela descrição (Pix, boleto, transferência). O resto que saiu da conta conta como débito.</p>
  </section>` : ''}

  ${maiores.length ? `<section class="panel">
    <div class="seg" role="group" aria-label="Mostrar">
      <button type="button" data-top="maiores" aria-pressed="${vistaTop === 'maiores'}">Maiores gastos</button>
      <button type="button" data-top="lugares" aria-pressed="${vistaTop === 'lugares'}">Onde mais gastou</button>
    </div>
    <div class="folha" data-vista="maiores"${vistaTop === 'maiores' ? '' : ' hidden'}><div class="list">${maiores.map(x => itemTx(x, true)).join('')}</div></div>
    <div class="folha" data-vista="lugares"${vistaTop === 'lugares' ? '' : ' hidden'}><div class="list">${onde.map(l => `<button type="button" class="item" data-ir="${esc(rotaDetalhe({ lugar: l.termo }, l.desc))}">
      <div class="name">${esc(l.desc)}</div><div class="val">${brl(l.v)}</div>
      <div class="meta">${l.n === 1 ? '1 vez' : `${l.n} vezes`}${l.n > 1 ? `, média de ${brl(l.v / l.n)}` : ''}</div><div class="meta r">${r.saidas > 0 ? pct(l.v / r.saidas) : ''}</div></button>`).join('')}</div></div>
  </section>

  <section class="panel">
    <h2>Dias da semana</h2>
    <div class="caixa"><div id="chSemana" class="chart"></div>
      <p class="sub">${DIAS_LONGOS[diaTop].charAt(0).toUpperCase() + DIAS_LONGOS[diaTop].slice(1)} é o dia em que mais gastou neste mês: ${brl(semana[diaTop])}. Toque num dia para ver os gastos dele.</p></div>
  </section>` : ''}

  ${r.entradasPorCategoria.length ? `<section class="panel"><div class="row between"><h2>De onde veio</h2><span class="sub">${brl(r.entradas)}</span></div>
    ${blocoPartes(partesCat(r.entradasPorCategoria, irCat), r.entradas, { unidade: ['entrada', 'entradas'] })}</section>` : ''}

  <section class="panel">
    <h2>Últimos 12 meses</h2>
    <div class="legenda"><span><i style="background:var(--entrada)"></i>Entradas</span><span><i style="background:var(--saida)"></i>Saídas</span></div>
    <div id="chMeses" class="chart"></div>
    <p class="note">Toque num mês para abrir o mês.</p>
  </section>

  <section class="panel">
    <div class="row between"><h2>Contas</h2><button type="button" class="btn small" data-ir="conferencia">Conferir com extrato</button></div>
    <div class="folha"><div class="list">${d.contas.filter(c => c.ativa && (!filtro.contas.length || filtro.contas.includes(c.id))).map(c => {
      const s = saldoEstimado(d.txs, c);
      const rc = resumoMes(cls, mes, c.id);
      const gc = gastoConta.get(c.id) || 0;
      return `<button type="button" class="item cat-linha" data-ir="${esc(rotaDetalhe({ conta: c.id }))}"><div class="name">${esc(c.nome)}</div>
      <div class="val">${s == null ? '' : brl(s)}</div>
      <div class="barra"><i style="width:${gc ? Math.max(2, gc / maiorConta * 100).toFixed(1) : 0}%"></i></div>
      <div class="meta">${c.tipo === 'cartao' ? 'Gastos' : 'Saídas'} no mês: ${brl(rc.saidas)}</div>
      <div class="meta r">${s == null ? 'sem saldo informado' : c.tipo === 'cartao' ? 'fatura estimada' : 'saldo estimado'}</div></button>`;
    }).join('')}</div></div>
  </section>

  ${blocoFaturas(cls, mes)}

  <section class="panel">
    <div class="row between"><h2>Últimas do mês</h2><button type="button" class="btn small" data-aba="transacoes">Ver todas</button></div>
    <div class="folha"><div class="list">${listaPorDia(cls.filter(x => x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm)).slice(0, 8)) || '<div class="empty">Nada neste mês ainda. As transações aparecem aqui assim que chegar uma notificação, você lançar à mão ou importar um extrato.</div>'}</div></div>
  </section>`;
  ligarFiltro(el);
  el.querySelector<HTMLButtonElement>('[data-titular]')?.addEventListener('click', async e => {
    const titular = (e.currentTarget as HTMLButtonElement).dataset.titular!;
    await mudar(dd => ({ ...dd, config: { ...dd.config, titular } }));
    toast('Nome salvo.');
  });
  graficoMeses(el.querySelector('#chMeses')!, serieMeses(cls, mes, 12), mes);
  const chR = el.querySelector<HTMLElement>('#chRitmo');
  if (chR) graficoRitmo(chR, acumulado(cls, mes), rt.dias, acumulado(cls, somaMes(mes, -1)), rt.projecao, [nomeMes(mes), ant]);
  const chS = el.querySelector<HTMLElement>('#chSemana');
  if (chS) graficoSemana(chS, semana, dia => rotaDetalhe({ dia }));
  el.querySelectorAll<HTMLButtonElement>('[data-top]').forEach(b => (b.onclick = () => {
    vistaTop = b.dataset.top as typeof vistaTop;
    el.querySelectorAll<HTMLButtonElement>('[data-top]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    el.querySelectorAll<HTMLElement>('[data-vista]').forEach(x => (x.hidden = x.dataset.vista !== vistaTop));
  }));
}

/** Pix com valor redondo: o que sobrou na conta do banco do cartão (ou o que faltou e saiu de lá). */
export function sobra(cc: Classificada, p: Classificada) {
  const dif = Math.round((Math.abs(p.valor) - Math.abs(cc.valor)) * 100) / 100;
  const banco = state.dados.contas.find(c => c.id === cc.conta)?.banco || 'do banco';
  if (Math.abs(dif) < 0.005) return '';
  return dif > 0 ? `. Mandou ${brl(Math.abs(p.valor))}: sobraram ${brl(dif)} na conta ${esc(banco)}, que continuam seus`
    : `. Mandou ${brl(Math.abs(p.valor))}: os outros ${brl(-dif)} saíram do que já estava na conta ${esc(banco)}`;
}

/**
 * Faturas pagas no mês: o pagamento que aparece em cada cartão e, quando o app achou, o Pix ou
 * débito da sua conta que pagou (as duas pontas ficam fora de entradas e gastos).
 */
function blocoFaturas(cls: Classificada[], mes: string) {
  const contas = state.dados.contas;
  const cartao = (id: string) => contas.find(c => c.id === id)?.tipo === 'cartao';
  const porId = new Map(cls.map(x => [x.id, x]));
  // Cada pagamento entra no mês da fatura que ele quita (pago em 05/10 = fatura de setembro).
  const doMes = cls.filter(x => x.t === 'fatura' && mesDaFatura(x.data) === mes).sort((a, b) => a.data.localeCompare(b.data));
  const itens = doMes.filter(x => cartao(x.conta)).map(cc => {
    const p = cc.par ? porId.get(cc.par) : undefined;
    return `<button type="button" class="item" data-ir="tx/${esc(cc.id)}"><div class="name">${esc(nomeConta(cc.conta))}</div><div class="val">${brl(Math.abs(cc.valor))}</div>
      <div class="meta">${p ? `Paga em ${fmtD(cc.data)} com ${esc(p.desc)} (${esc(nomeConta(p.conta))}, ${fmtD(p.data)})${sobra(cc, p)}.` : `Paga em ${fmtD(cc.data)}. O dinheiro saiu de uma conta que não está no app, ou o extrato dela (desse período) ainda não foi importado.`}</div><div class="meta r"></div></button>`;
  });
  // Pagamento na conta sem o lançamento no cartão (ex.: fatura do cartão ainda não importada).
  for (const x of doMes) if (!cartao(x.conta) && !(x.par && porId.has(x.par)) && x.valor < 0)
    itens.push(`<button type="button" class="item" data-ir="tx/${esc(x.id)}"><div class="name">${esc(x.desc)}</div><div class="val">${brl(-x.valor)}</div>
      <div class="meta">${esc(nomeConta(x.conta))}, ${fmtD(x.data)}. Sem o pagamento no cartão: importe a fatura para ligar os dois.</div><div class="meta r"></div></button>`);
  if (!itens.length) return '';
  return `<section class="panel"><div class="row between"><h2>Faturas de ${mesLongo(mes).split(' de ')[0]}</h2></div><div class="folha"><div class="list">${itens.join('')}</div></div>
    <p class="note">Cada fatura aparece no mês dos gastos dela, mesmo paga no começo do mês seguinte. O dinheiro que você manda para pagar e o pagamento no cartão são a mesma coisa: ficam fora de entradas e gastos, porque cada compra já contou no dia em que foi feita.</p></section>`;
}

/** Todas as entradas (ou todas as saídas) do mês, com troca de mês e o filtro do Painel. */
export function telaMovimentos(el: HTMLElement, tipo: string) {
  const ent = tipo === 'entrada';
  const mes = mesAtual();
  const xs = clsFiltradas().filter(x => x.data.slice(0, 7) === mes && x.t === (ent ? 'entrada' : 'saida'))
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const total = xs.reduce((s, x) => s + (ent ? x.valor : -x.valor), 0);
  const estornos = ent ? 0 : xs.filter(x => x.valor > 0).length;
  const rm = resumoMes(clsFiltradas(), mes);
  const cats = ent ? rm.entradasPorCategoria : rm.porCategoria;
  el.innerHTML = `<section class="fita">
    ${navMes(mes, botaoFiltro())}
    ${linhaFiltro()}
    <div class="seg" role="group" aria-label="Mostrar">
      <button type="button" data-trocar="entrada" aria-pressed="${ent}">Entradas</button>
      <button type="button" data-trocar="saida" aria-pressed="${!ent}">Saídas</button>
    </div>
    <p class="frase">${xs.length ? `${ent ? 'Entrou' : 'Saiu'} <b>${brl(total)}</b> em ${xs.length === 1 ? (ent ? '1 entrada' : '1 gasto') : `${xs.length} ${ent ? 'entradas' : 'gastos'}`}.` : `Nenhuma ${ent ? 'entrada' : 'saída'} neste mês.`}</p>
    ${estornos ? `<p class="sub">Inclui ${estornos === 1 ? '1 estorno' : `${estornos} estornos`}, que descontam do total.</p>` : ''}
  </section>
  ${cats.length ? `<section class="panel"><div class="row between"><h2>Por categoria</h2><span class="sub">${brl(ent ? rm.entradas : rm.saidas)}</span></div>
    ${blocoPartes(partesCat(cats, irCat), ent ? rm.entradas : rm.saidas, { unidade: ent ? ['entrada', 'entradas'] : ['transação', 'transações'] })}</section>` : ''}
  ${xs.length ? `<section class="panel"><h2>${ent ? 'Entradas' : 'Saídas'} do mês</h2><div class="folha"><div class="list">${listaPorDia(xs)}</div></div>
    <p class="note">Caixinha, transferências entre suas contas e pagamento de fatura não aparecem aqui: são dinheiro seu mudando de lugar.</p></section>` : ''}`;
  el.querySelectorAll<HTMLButtonElement>('[data-trocar]').forEach(b => (b.onclick = () => trocar(`movimentos/${b.dataset.trocar}`)));
  ligarFiltro(el);
}

/**
 * Detalhe de qualquer parte do Painel (categoria, forma de pagamento, conta, lugar, dia da
 * semana, ou várias juntas): total do mês, média, as divisões que ainda fazem sentido (em pizza,
 * tocáveis), 12 meses e as transações do mês.
 */
export function telaDetalhe(el: HTMLElement, rec: Recorte, nome = '') {
  const d = state.dados;
  const mes = mesAtual();
  const sub = recortar(clsFiltradas(), d.contas, rec);
  const r = resumoMes(sub, mes);
  const doMes = sub.filter(x => x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const nG = doMes.filter(x => x.t === 'saida').length, nE = doMes.filter(x => x.t === 'entrada').length;
  const meses = serieMeses(sub, mes, 12);
  const temE = meses.some(m => m.entradas > 0), temS = meses.some(m => m.saidas > 0);
  const soEntrada = temE && !temS;
  const media = meses.slice(0, -1).reduce((a, m) => a + (soEntrada ? m.entradas : m.saidas), 0) / 11;
  const conta = rec.conta ? d.contas.find(c => c.id === rec.conta) : undefined;
  const com = (extra: Recorte) => rotaDetalhe({ ...rec, ...extra }, nome);
  const gastos = (n: number) => (n === 1 ? '1 gasto' : `${n} gastos`), entradas = (n: number) => (n === 1 ? '1 entrada' : `${n} entradas`);
  const frase = nG ? `Saiu <b>${brl(r.saidas)}</b> em ${gastos(nG)}.` : nE ? `Entrou <b>${brl(r.entradas)}</b> em ${entradas(nE)}.` : 'Nada entrou nem saiu neste mês.';
  const fraseE = nG && nE ? `Entrou ${brl(r.entradas)} em ${entradas(nE)}.` : '';
  const secoes: string[] = [];
  const secao = (h: string, total: number, corpo: string) => corpo && secoes.push(`<section class="panel"><div class="row between"><h2>${h}</h2><span class="sub">${brl(total)}</span></div>${corpo}</section>`);
  if (rec.cat == null && r.porCategoria.length)
    secao('Por categoria', r.saidas, blocoPartes(partesCat(r.porCategoria, c => com({ cat: c })), r.saidas, { unidade: ['gasto', 'gastos'] }));
  const formas = porForma(sub, d.contas, mes);
  if (!rec.forma && formas.length > 1)
    secao('Como pagou', r.saidas, blocoPartes(partesForma(formas, f => com({ forma: f })), r.saidas, { unidade: ['gasto', 'gastos'] }));
  const contas = porConta(sub, mes);
  if (!rec.conta && contas.length > 1)
    secao('Por conta', r.saidas, blocoPartes(partesConta(contas, c => com({ conta: c })), r.saidas, { unidade: ['gasto', 'gastos'] }));
  if (rec.cat == null && r.entradasPorCategoria.length)
    secao('De onde veio', r.entradas, blocoPartes(partesCat(r.entradasPorCategoria, c => com({ cat: c })), r.entradas, { unidade: ['entrada', 'entradas'] }));
  if (rec.lugar == null && !rec.forma && !rec.conta && rec.dia == null) {
    // Categoria: onde mais gastou nela.
    const onde = lugares(sub, mes, 5).filter(l => l.n > 0);
    if (onde.length > 1) secoes.push(`<section class="panel"><h2>Onde mais gastou</h2><div class="folha"><div class="list">${onde.map(l => `<button type="button" class="item" data-ir="${esc(rotaDetalhe({ ...rec, lugar: l.termo }, l.desc))}">
      <div class="name">${esc(l.desc)}</div><div class="val">${brl(l.v)}</div>
      <div class="meta">${l.n === 1 ? '1 vez' : `${l.n} vezes`}${l.n > 1 ? `, média de ${brl(l.v / l.n)}` : ''}</div><div class="meta r">${r.saidas > 0 ? pct(l.v / r.saidas) : ''}</div></button>`).join('')}</div></div></section>`);
  }
  const outros = Object.keys(rec).length > 1;
  const botoes = [
    rec.cat != null && outros ? `<button type="button" class="btn small" data-ir="${irCat(rec.cat)}">Toda a categoria ${esc(rec.cat)}</button>` : '',
    conta ? `<button type="button" class="btn small" data-aba="transacoes?conta=${encodeURIComponent(conta.id)}">Ver transações</button>` : '',
    conta ? `<button type="button" class="btn small" data-ir="conta/${encodeURIComponent(conta.id)}">Editar conta</button>` : '',
  ].filter(Boolean);
  const saldo = conta ? saldoEstimado(d.txs, conta) : null;
  el.innerHTML = `<section class="fita">
    ${navMes(mes, botaoFiltro())}
    ${linhaFiltro()}
    <p class="frase">${frase}</p>
    ${fraseE ? `<p class="sub">${fraseE}</p>` : ''}
    ${media > 0.005 ? `<p class="sub">Média dos 11 meses anteriores: ${brl(media)}${soEntrada ? '' : ' de gastos'}.</p>` : ''}
    ${saldo != null ? `<p class="sub">${conta!.tipo === 'cartao' ? 'Fatura estimada' : 'Saldo estimado'}: ${brl(saldo)}.</p>` : ''}
    ${botoes.length ? `<div class="row">${botoes.join('')}</div>` : ''}
  </section>
  ${secoes.join('')}
  ${temE || temS ? `<section class="panel"><h2>Últimos 12 meses</h2>
    ${temE && temS ? `<div class="legenda"><span><i style="background:var(--entrada)"></i>Entradas</span><span><i style="background:var(--saida)"></i>Saídas</span></div>` : ''}
    <div id="chDet" class="chart"></div></section>` : ''}
  <section class="panel"><h2>Transações do mês</h2><div class="folha"><div class="list">${listaPorDia(doMes) || '<div class="empty">Nada neste mês.</div>'}</div></div>
    ${conta && doMes.some(x => !contaNoTotal(x.t)) ? '<p class="note">Inclui caixinha, transferências entre suas contas e pagamento de fatura, que não contam como entrada nem gasto.</p>' : ''}</section>`;
  const ch = el.querySelector<HTMLElement>('#chDet');
  if (ch) graficoMeses(ch, meses, mes);
  ligarFiltro(el);
}

export const telaCategoria = (el: HTMLElement, cat: string) => telaDetalhe(el, { cat });

export function telaSemCategoria(el: HTMLElement) {
  const mes = mesAtual();
  const lista = classificadas().filter(x => !x.c && contaNoTotal(x.t) && x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data));
  el.innerHTML = `<section class="fita">${navMes(mes)}
    <p class="sub">Entradas e saídas que nenhuma palavra-chave nem regra conseguiu categorizar. Toque numa para escolher a categoria e marque “aplicar às parecidas” para o app aprender.</p>
    <div class="row"><button type="button" class="btn small" data-ir="categorias">Editar palavras-chave</button></div></section>
  <div class="folha"><div class="list">${listaPorDia(lista) || '<div class="empty">Tudo categorizado neste mês.</div>'}</div></div>`;
}

export function telaFora(el: HTMLElement) {
  const mes = mesAtual();
  const lista = classificadas().filter(x => !contaNoTotal(x.t) && x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data));
  el.innerHTML = `<section class="fita">${navMes(mes)}
    <p class="sub">Dinheiro seu mudando de lugar: caixinha e reserva, transferência entre suas contas, Pix para você mesmo e pagamento de fatura (as compras do cartão já contam como saída na data da compra). Nada disso entra nas entradas e saídas.</p>
    <p class="note">Se algo aqui for entrada ou gasto de verdade, toque nele e mude o tipo.</p></section>
  <div class="folha"><div class="list">${listaPorDia(lista) || '<div class="empty">Nada neste mês.</div>'}</div></div>`;
}

/** Abre um mês (toque numa barra do gráfico de 12 meses). */
export function abrirMes(ym: string) {
  if (/^\d{4}-\d{2}$/.test(ym) && ym <= hoje().slice(0, 7)) mesSel = ym;
}

export function mudarMes(delta: number) {
  const novo = somaMes(mesAtual(), delta);
  if (novo > hoje().slice(0, 7)) return;
  mesSel = novo;
}
