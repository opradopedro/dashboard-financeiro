// Painel (adaptado do carteira, src/ui/banco.ts): entradas e saídas reais do mês, gastos por
// categoria, gráfico de 12 meses e o que precisa de atenção.
import { classificadas, nomeConta, state } from '../app';
import { resumoMes, saldoEstimado, serieMeses, SEM_CATEGORIA, type Classificada } from '../core/classificar';
import { FORMAS, lugares, maioresGastos, porConta, porDiaSemana, porForma, ritmo, acumulado } from '../core/indicadores';
import { TIPOS, contaNoTotal } from '../core/tipos';
import { hoje, somaDias, somaMes } from '../core/util';
import { brl, compact, esc, fmtD, fmtNum, fmtYm, MES, mesLongo, sinal } from './fmt';
import { COR_OUTRAS, CORES_CAT, fitaEmpilhada, graficoRitmo, graficoSemana } from './graficos';
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
  // Pagamento de fatura fica fora da conta (o gasto já contou na compra) e não aparece aqui.
  const fora = [r.fora.caixinha && `caixinha ${brl(r.fora.caixinha)}`, r.fora.interna && `transferências entre suas contas ${brl(r.fora.interna)}`].filter(Boolean);
  const cores = coresCategorias(r.porCategoria);
  const fatiasCat: { v: number; cor: string; rotulo: string }[] = [];
  for (const c of r.porCategoria) {
    const cor = cores.get(c.cat)!;
    const ult = fatiasCat[fatiasCat.length - 1];
    if (cor === COR_OUTRAS && ult?.cor === COR_OUTRAS) { ult.v += c.v; ult.rotulo = 'outras'; } else fatiasCat.push({ v: c.v, cor, rotulo: cor === COR_OUTRAS ? 'outras' : c.cat });
  }
  const rt = ritmo(cls, mes, hoje());
  const formas = porForma(cls, d.contas, mes);
  const maiorForma = formas[0]?.v || 1;
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
    ${fitaEmpilhada(fatiasCat)}
    <div class="folha"><div class="list">${r.porCategoria.length ? r.porCategoria.map(c => `<button type="button" class="item cat-linha" data-ir="cat/${encodeURIComponent(c.cat)}">
      <div class="name">${esc(c.cat)}</div><div class="val">${brl(c.v)}</div>
      <div class="barra"><i style="width:${Math.max(2, c.v / maior * 100).toFixed(1)}%;background:${cores.get(c.cat)}"></i></div>
      <div class="meta">${c.n === 1 ? '1 transação' : `${c.n} transações`}</div><div class="meta r">${r.saidas > 0 ? fmtNum(c.v / r.saidas * 100) + '%' : ''}</div></button>`).join('')
      : '<div class="empty">Nenhum gasto neste mês.</div>'}</div></div>
    ${r.semCategoria ? `<button type="button" class="btn small" data-ir="semcat/${mes}">Categorizar ${r.semCategoria === 1 ? '1 transação' : `${r.semCategoria} transações`}</button>` : ''}
  </section>

  ${rt.total > 0 || rt.anterior > 0 ? `<section class="panel">
    <h2>Ritmo do mês</h2>
    <div class="caixa">
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
    <div class="folha"><div class="list">${formas.map(f => `<div class="item cat-linha">
      <div class="name">${FORMAS[f.chave]}</div><div class="val">${brl(f.v)}</div>
      <div class="barra"><i style="width:${Math.max(2, f.v / maiorForma * 100).toFixed(1)}%"></i></div>
      <div class="meta">${f.n === 1 ? '1 gasto' : `${f.n} gastos`}</div><div class="meta r">${r.saidas > 0 ? pct(f.v / r.saidas) : ''}</div></div>`).join('')}</div></div>
    <p class="note">Pela conta (cartão = crédito; vale = conta de benefício) e pela descrição (Pix, boleto, transferência). O resto que saiu da conta conta como débito.</p>
  </section>` : ''}

  ${maiores.length ? `<section class="panel">
    <div class="seg" role="group" aria-label="Mostrar">
      <button type="button" data-top="maiores" aria-pressed="${vistaTop === 'maiores'}">Maiores gastos</button>
      <button type="button" data-top="lugares" aria-pressed="${vistaTop === 'lugares'}">Onde mais gastou</button>
    </div>
    <div class="folha" data-vista="maiores"${vistaTop === 'maiores' ? '' : ' hidden'}><div class="list">${maiores.map(x => itemTx(x, true)).join('')}</div></div>
    <div class="folha" data-vista="lugares"${vistaTop === 'lugares' ? '' : ' hidden'}><div class="list">${onde.map(l => `<button type="button" class="item" data-aba="transacoes?q=${encodeURIComponent(l.termo)}">
      <div class="name">${esc(l.desc)}</div><div class="val">${brl(l.v)}</div>
      <div class="meta">${l.n === 1 ? '1 vez' : `${l.n} vezes`}${l.n > 1 ? `, média de ${brl(l.v / l.n)}` : ''}</div><div class="meta r">${r.saidas > 0 ? pct(l.v / r.saidas) : ''}</div></button>`).join('')}</div></div>
  </section>

  <section class="panel">
    <h2>Dias da semana</h2>
    <div class="caixa"><div id="chSemana" class="chart"></div>
      <p class="sub">${DIAS_LONGOS[diaTop].charAt(0).toUpperCase() + DIAS_LONGOS[diaTop].slice(1)} é o dia em que mais gastou neste mês: ${brl(semana[diaTop])}.</p></div>
  </section>` : ''}

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
      const gc = gastoConta.get(c.id) || 0;
      return `<button type="button" class="item cat-linha" data-aba="transacoes?conta=${encodeURIComponent(c.id)}"><div class="name">${esc(c.nome)}</div>
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
  graficoMeses(el.querySelector('#chMeses')!, serieMeses(cls, mes, 12), mes);
  const chR = el.querySelector<HTMLElement>('#chRitmo');
  if (chR) graficoRitmo(chR, acumulado(cls, mes), rt.dias, acumulado(cls, somaMes(mes, -1)), rt.projecao, [nomeMes(mes), ant]);
  const chS = el.querySelector<HTMLElement>('#chSemana');
  if (chS) graficoSemana(chS, semana);
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
  const doMes = cls.filter(x => x.t === 'fatura' && x.data.slice(0, 7) === mes);
  const itens = doMes.filter(x => cartao(x.conta)).map(cc => {
    const p = cc.par ? porId.get(cc.par) : undefined;
    return `<button type="button" class="item" data-ir="tx/${esc(cc.id)}"><div class="name">${esc(nomeConta(cc.conta))}</div><div class="val">${brl(Math.abs(cc.valor))}</div>
      <div class="meta">${p ? `Paga em ${fmtD(cc.data)} com ${esc(p.desc)} (${esc(nomeConta(p.conta))}, ${fmtD(p.data)})${sobra(cc, p)}.` : `Paga em ${fmtD(cc.data)}. O app não achou o Pix ou débito que pagou${state.dados.config.titular ? '' : ' (se foi um Pix para você mesmo com valor redondo, informe seu nome em Ajustes)'}.`}</div><div class="meta r"></div></button>`;
  });
  // Pagamento na conta sem o lançamento no cartão (ex.: fatura do cartão ainda não importada).
  for (const x of doMes) if (!cartao(x.conta) && !(x.par && porId.has(x.par)) && x.valor < 0)
    itens.push(`<button type="button" class="item" data-ir="tx/${esc(x.id)}"><div class="name">${esc(x.desc)}</div><div class="val">${brl(-x.valor)}</div>
      <div class="meta">${esc(nomeConta(x.conta))}, ${fmtD(x.data)}. Sem o pagamento no cartão: importe a fatura para ligar os dois.</div><div class="meta r"></div></button>`);
  if (!itens.length) return '';
  return `<section class="panel"><h2>Faturas pagas</h2><div class="folha"><div class="list">${itens.join('')}</div></div>
    <p class="note">O dinheiro que você manda para pagar a fatura e o pagamento no cartão são a mesma coisa: ficam fora de entradas e gastos, porque cada compra já contou no dia em que foi feita.</p></section>`;
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
