// Painel (adaptado do carteira, src/ui/banco.ts): entradas e saídas reais do mês, gastos por
// categoria, gráfico de 12 meses e o que precisa de atenção.
import { classificadas, nomeConta, state } from '../app';
import { resumoMes, saldoEstimado, serieMeses, SEM_CATEGORIA, type Classificada } from '../core/classificar';
import { TIPOS, contaNoTotal } from '../core/tipos';
import { hoje, somaDias, somaMes } from '../core/util';
import { brl, compact, esc, fmtD, fmtNum, fmtYm, MES, mesLongo, sinal } from './fmt';
import { ICONES } from './icones';

// Mês aberto nas telas (só na memória: ao abrir o app, volta para o mês atual).
let mesSel: string | null = null;
export const mesAtual = () => mesSel || hoje().slice(0, 7);

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

/** Barras de entradas x saídas por mês (SVG; cores validadas para daltonismo). */
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
    g += `<rect x="${(L + i * bw).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" fill="transparent"><title>${fmtYm(x.mes)}: entradas ${brl(x.entradas)}, saídas ${brl(x.saidas)}</title></rect>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por mês" font-family="inherit">${g}</svg>`;
}

/** Cabeçalho de mês: o nome do mês é o título da tela. */
export function navMes(mes: string) {
  const fim = hoje().slice(0, 7);
  const nome = mesLongo(mes).split(' de ');
  return `<div class="fita-mes">
    <h2>${nome[0]}${nome[1] !== fim.slice(0, 4) ? `<small>${nome[1]}</small>` : ''}</h2>
    <div class="setas">
      <button type="button" data-mes-mudar="-1" aria-label="Mês anterior">${ICONES.antes}</button>
      <button type="button" data-mes-mudar="1" aria-label="Próximo mês"${mes >= fim ? ' disabled' : ''}>${ICONES.depois}</button>
    </div>
  </div>`;
}

export function telaPainel(el: HTMLElement) {
  const d = state.dados;
  const cls = classificadas();
  const mes = mesAtual();
  const r = resumoMes(cls, mes);
  const n = state.nativo;
  const semRegra = d.notifs.filter(x => x.status === 'sem-regra' || x.status === 'erro').length;
  const maior = r.porCategoria[0]?.v || 1;
  const avisos: string[] = [];
  if (n && !n.web && !n.acessoPermitido) avisos.push(`<button type="button" class="aviso" data-ir="boasvindas">A captura de notificações está desligada. Toque para liberar.</button>`);
  if (d.revisoes.length) avisos.push(`<button type="button" class="aviso" data-ir="revisao">${d.revisoes.length === 1 ? '1 linha de extrato espera' : `${d.revisoes.length} linhas de extrato esperam`} sua revisão</button>`);
  if (semRegra) avisos.push(`<button type="button" class="aviso leve" data-aba="notificacoes?status=sem-regra">${semRegra === 1 ? '1 notificação está' : `${semRegra} notificações estão`} sem regra</button>`);
  const total = r.entradas + r.saidas;
  const pe = total > 0 ? (r.entradas / total) * 100 : 50;
  const fora = [r.fora.caixinha && `caixinha ${brl(r.fora.caixinha)}`, r.fora.interna && `transferências entre suas contas ${brl(r.fora.interna)}`, r.fora.fatura && `pagamento de fatura ${brl(r.fora.fatura)}`].filter(Boolean);
  const frase = !total ? 'Nada entrou nem saiu neste mês ainda.'
    : r.saldo >= 0 ? `Sobrou <b>${brl(r.saldo)}</b> do que entrou.` : `Saiu <b>${brl(-r.saldo)}</b> a mais do que entrou.`;

  el.innerHTML = `
  <section class="fita">
    ${navMes(mes)}
    <p class="frase">${frase}</p>
    ${total ? `<div class="barra-dupla" role="img" aria-label="Entradas ${brl(r.entradas)}, saídas ${brl(r.saidas)}">${r.entradas ? `<i class="e" style="width:${pe.toFixed(1)}%"></i>` : ''}${r.saidas ? `<i class="s" style="width:${(100 - pe).toFixed(1)}%"></i>` : ''}</div>` : ''}
    <div class="fita-valores">
      <div><span><i class="ponto e"></i>Entradas</span><b>${brl(r.entradas)}</b></div>
      <div><span><i class="ponto s"></i>Saídas</span><b>${brl(r.saidas)}</b></div>
    </div>
    ${fora.length ? `<button type="button" class="nota-fora" data-ir="fora/${mes}">Fora da conta, por ser dinheiro seu mudando de lugar: ${fora.join(', ')}. <u>Ver quais</u></button>` : ''}
  </section>

  ${avisos.length ? `<div class="panel">${avisos.join('')}</div>` : ''}

  <section class="panel">
    <div class="row between"><h2>Para onde foi</h2><span class="sub">${brl(r.saidas)}</span></div>
    <div class="folha"><div class="list">${r.porCategoria.length ? r.porCategoria.map(c => `<button type="button" class="item cat-linha" data-ir="cat/${encodeURIComponent(c.cat)}">
      <div class="name">${esc(c.cat)}</div><div class="val">${brl(c.v)}</div>
      <div class="barra"><i class="${c.cat === SEM_CATEGORIA ? 'sem' : ''}" style="width:${Math.max(2, c.v / maior * 100).toFixed(1)}%"></i></div>
      <div class="meta">${c.n === 1 ? '1 transação' : `${c.n} transações`}</div><div class="meta r">${r.saidas > 0 ? fmtNum(c.v / r.saidas * 100) + '%' : ''}</div></button>`).join('')
      : '<div class="empty">Nenhum gasto neste mês.</div>'}</div></div>
    ${r.semCategoria ? `<button type="button" class="btn small" data-ir="semcat/${mes}">Categorizar ${r.semCategoria === 1 ? '1 transação' : `${r.semCategoria} transações`}</button>` : ''}
  </section>

  ${r.entradasPorCategoria.length ? `<section class="panel"><h2>De onde veio</h2><div class="folha"><div class="list">${r.entradasPorCategoria.map(c => `<button type="button" class="item" data-ir="cat/${encodeURIComponent(c.cat)}">
      <div class="name">${esc(c.cat)}</div><div class="val">${brl(c.v)}</div><div class="meta">${c.n === 1 ? '1 entrada' : `${c.n} entradas`}</div><div class="meta r"></div></button>`).join('')}</div></div></section>` : ''}

  <section class="panel">
    <h2>Últimos 12 meses</h2>
    <div class="legenda"><span><i style="background:var(--entrada)"></i>Entradas</span><span><i style="background:var(--saida)"></i>Saídas</span></div>
    <div id="chMeses" class="chart"></div>
  </section>

  <section class="panel">
    <div class="row between"><h2>Contas</h2><button type="button" class="btn small" data-ir="conferencia">Conferir com extrato</button></div>
    <div class="folha"><div class="list">${d.contas.filter(c => c.ativa).map(c => {
      const s = saldoEstimado(d.txs, c);
      const rc = resumoMes(cls, mes, c.id);
      return `<button type="button" class="item" data-aba="transacoes?conta=${encodeURIComponent(c.id)}"><div class="name">${esc(c.nome)}</div>
      <div class="val">${s == null ? '' : brl(s)}</div><div class="meta">${c.tipo === 'cartao' ? 'Gastos' : 'Saídas'} no mês: ${brl(rc.saidas)}</div>
      <div class="meta r">${s == null ? 'sem saldo informado' : c.tipo === 'cartao' ? 'fatura estimada' : 'saldo estimado'}</div></button>`;
    }).join('')}</div></div>
  </section>

  <section class="panel">
    <div class="row between"><h2>Últimas do mês</h2><button type="button" class="btn small" data-aba="transacoes">Ver todas</button></div>
    <div class="folha"><div class="list">${listaPorDia(cls.filter(x => x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm)).slice(0, 8)) || '<div class="empty">Nada neste mês ainda. As transações aparecem aqui assim que chegar uma notificação, você lançar à mão ou importar um extrato.</div>'}</div></div>
  </section>`;
  graficoMeses(el.querySelector('#chMeses')!, serieMeses(cls, mes, 12), mes);
}

export function telaCategoria(el: HTMLElement, cat: string) {
  const mes = mesAtual();
  const cls = classificadas().filter(x => (x.c || SEM_CATEGORIA) === cat && contaNoTotal(x.t));
  const doMes = cls.filter(x => x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data));
  const receita = state.dados.categorias.find(c => c.nome === cat)?.receita ?? false;
  const total = doMes.reduce((s, x) => s + (receita ? x.valor : -x.valor), 0);
  const meses = serieMeses(cls, mes, 12);
  const media = meses.slice(0, -1).reduce((s, m) => s + (receita ? m.entradas : m.saidas), 0) / 11;
  el.innerHTML = `<section class="fita">
    ${navMes(mes)}
    <p class="frase">${esc(cat)}: <b>${brl(total)}</b></p>
    <p class="sub">Média dos 11 meses anteriores: ${brl(media)}</p>
    <div id="chCat" class="chart"></div>
  </section>
  <section class="panel"><h2>Transações</h2><div class="folha"><div class="list">${listaPorDia(doMes) || '<div class="empty">Nada neste mês.</div>'}</div></div></section>`;
  graficoMeses(el.querySelector('#chCat')!, meses.map(m => (receita ? { ...m, saidas: 0 } : { ...m, entradas: 0 })), mes);
}

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

export function mudarMes(delta: number) {
  const novo = somaMes(mesAtual(), delta);
  if (novo > hoje().slice(0, 7)) return;
  mesSel = novo;
}
