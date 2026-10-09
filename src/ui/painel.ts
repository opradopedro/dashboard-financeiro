// Painel (adaptado do carteira, src/ui/banco.ts): entradas e saídas reais do mês, gastos por
// categoria, gráfico de 12 meses e o que precisa de atenção.
import { classificadas, nomeConta, state } from '../app';
import { resumoMes, saldoEstimado, serieMeses, SEM_CATEGORIA, type Classificada } from '../core/classificar';
import { TIPOS, contaNoTotal } from '../core/tipos';
import { hoje, somaMes } from '../core/util';
import { brl, compact, esc, fmtD, fmtNum, fmtYm, MES, mesLongo, sinal } from './fmt';

export const mesAtual = () => state.dados.config.mes || hoje().slice(0, 7);

export function itemTx(x: Classificada) {
  const conta = contaNoTotal(x.t);
  const rotulo = conta ? (x.c || SEM_CATEGORIA) : TIPOS[x.t];
  const cor = conta ? (x.c ? (x.valor > 0 ? 'gain' : 'muted') : 'warn') : 'muted';
  const orig = x.origens.map(o => (o.tipo === 'notificacao' ? '🔔' : o.tipo === 'extrato' ? '📄' : '✍️')).join('');
  return `<button type="button" class="item${conta ? '' : ' fora'}" data-ir="tx/${esc(x.id)}">
    <div class="name">${esc(x.desc)}</div>
    <div class="val ${x.valor > 0 && conta ? 'up' : ''}">${sinal(x.valor)}</div>
    <div class="meta">${fmtD(x.data)} · ${esc(nomeConta(x.conta))} ${orig}</div>
    <div class="meta r"><span class="tag" style="color:var(--${cor})">${esc(rotulo)}</span></div></button>`;
}

/** Barras de entradas x saídas por mês (SVG, como no carteira). */
export function graficoMeses(el: HTMLElement, s: { mes: string; entradas: number; saidas: number }[], atual: string) {
  const W = Math.max(280, el.clientWidth || 320), H = 180, L = 44, R = 6, T = 10, B = 24;
  const max = Math.max(1, ...s.flatMap(x => [x.entradas, x.saidas]));
  const p10 = Math.pow(10, Math.floor(Math.log10(max / 3))), f = max / 3 / p10;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p10, y1 = Math.ceil(max / step) * step;
  const Y = (v: number) => T + (1 - v / y1) * (H - T - B), bw = (W - L - R) / s.length;
  let g = '';
  for (let v = 0; v <= y1 + step / 2; v += step)
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${compact(v)}</text>`;
  s.forEach((x, i) => {
    const x0 = L + i * bw + bw * 0.14, w = bw * 0.34, op = x.mes === atual ? 1 : 0.55;
    if (x.entradas > 0) g += `<rect x="${x0.toFixed(1)}" y="${Y(x.entradas).toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - Y(x.entradas)).toFixed(1)}" rx="2" fill="var(--gain)" opacity="${op}"/>`;
    if (x.saidas > 0) g += `<rect x="${(x0 + w + bw * 0.04).toFixed(1)}" y="${Y(x.saidas).toFixed(1)}" width="${w.toFixed(1)}" height="${(Y(0) - Y(x.saidas)).toFixed(1)}" rx="2" fill="var(--loss)" opacity="${op}"/>`;
    if ((s.length - 1 - i) % 2 === 0) g += `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${MES[parseInt(x.mes.slice(5), 10) - 1]}</text>`;
    g += `<rect x="${(L + i * bw).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" fill="transparent" data-mes="${x.mes}"><title>${fmtYm(x.mes)}: entradas ${brl(x.entradas)}, saídas ${brl(x.saidas)}</title></rect>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por mês" font-family="inherit">${g}</svg>`;
}

export function navMes(mes: string) {
  const fim = hoje().slice(0, 7);
  return `<div class="row between nowrap">
    <button type="button" class="btn icon" data-mes-mudar="-1" aria-label="Mês anterior">‹</button>
    <h2 class="mes">${mesLongo(mes)}</h2>
    <button type="button" class="btn icon" data-mes-mudar="1" aria-label="Próximo mês"${mes >= fim ? ' disabled' : ''}>›</button>
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
  if (n && !n.web && !n.acessoPermitido) avisos.push(`<button type="button" class="aviso" data-ir="boasvindas">A captura de notificações está desligada. Toque para liberar ›</button>`);
  if (d.revisoes.length) avisos.push(`<button type="button" class="aviso" data-ir="revisao">${d.revisoes.length} ${d.revisoes.length === 1 ? 'linha de extrato precisa' : 'linhas de extrato precisam'} de revisão ›</button>`);
  if (semRegra) avisos.push(`<button type="button" class="aviso leve" data-aba="notificacoes?status=sem-regra">${semRegra} ${semRegra === 1 ? 'notificação ficou' : 'notificações ficaram'} sem regra ›</button>`);
  const fora = r.fora.caixinha + r.fora.interna + r.fora.fatura;

  el.innerHTML = `
  ${avisos.join('')}
  <div class="panel">
    ${navMes(mes)}
    <div class="stats">
      <div><span class="label">Entradas</span><b class="lg up">${brl(r.entradas)}</b></div>
      <div><span class="label">Saídas</span><b class="lg down">${brl(r.saidas)}</b></div>
      <div><span class="label">Saldo do mês</span><b class="lg ${r.saldo >= 0 ? 'up' : 'down'}">${brl(r.saldo)}</b></div>
    </div>
    ${r.entradas > 0 ? `<div class="sub">Sobrou ${fmtNum(Math.max(0, r.saldo) / r.entradas * 100)}% do que entrou.</div>` : ''}
    ${fora > 0.005 ? `<button type="button" class="nota-fora" data-ir="fora/${mes}">Não contam aqui: ${[r.fora.caixinha && `caixinha/reserva ${brl(r.fora.caixinha)}`, r.fora.interna && `transferências entre suas contas ${brl(r.fora.interna)}`, r.fora.fatura && `pagamento de fatura ${brl(r.fora.fatura)}`].filter(Boolean).join(' · ')}. Ver ›</button>` : ''}
  </div>

  <div class="panel">
    <div class="row between"><h2>Gastos por categoria</h2><span class="sub">${brl(r.saidas)}</span></div>
    <div class="list">${r.porCategoria.length ? r.porCategoria.map(c => `<button type="button" class="item cat-linha" data-ir="cat/${encodeURIComponent(c.cat)}">
      <div class="name">${esc(c.cat)}</div><div class="val">${brl(c.v)} ›</div>
      <div class="barra"><i style="width:${Math.max(2, c.v / maior * 100).toFixed(1)}%${c.cat === SEM_CATEGORIA ? ';background:var(--warn)' : ''}"></i></div>
      <div class="meta">${c.n} ${c.n === 1 ? 'transação' : 'transações'}</div><div class="meta r">${r.saidas > 0 ? fmtNum(c.v / r.saidas * 100) + '%' : ''}</div></button>`).join('')
      : '<div class="empty">Nenhum gasto neste mês.</div>'}</div>
    ${r.semCategoria ? `<button type="button" class="btn small" data-ir="semcat/${mes}">Ver ${r.semCategoria} sem categoria</button>` : ''}
  </div>

  ${r.entradasPorCategoria.length ? `<div class="panel"><h2>De onde veio</h2><div class="list">${r.entradasPorCategoria.map(c => `<button type="button" class="item" data-ir="cat/${encodeURIComponent(c.cat)}">
      <div class="name">${esc(c.cat)}</div><div class="val up">${brl(c.v)} ›</div><div class="meta">${c.n} ${c.n === 1 ? 'entrada' : 'entradas'}</div><div class="meta r"></div></button>`).join('')}</div></div>` : ''}

  <div class="panel">
    <h2>Entradas e saídas por mês</h2>
    <div class="legenda"><span><i style="background:var(--gain)"></i>Entradas</span><span><i style="background:var(--loss)"></i>Saídas</span></div>
    <div id="chMeses" class="chart"></div>
  </div>

  <div class="panel">
    <div class="row between"><h2>Contas</h2><button type="button" class="btn small" data-ir="conferencia">Conferência ›</button></div>
    <div class="list">${d.contas.filter(c => c.ativa).map(c => {
      const s = saldoEstimado(d.txs, c);
      const rc = resumoMes(cls, mes, c.id);
      return `<button type="button" class="item" data-aba="transacoes?conta=${encodeURIComponent(c.id)}"><div class="name">${esc(c.nome)}</div>
      <div class="val">${s == null ? '' : brl(s)}</div><div class="meta">${c.tipo === 'cartao' ? 'gastos no mês' : 'saídas no mês'}: ${brl(rc.saidas)}</div>
      <div class="meta r">${s == null ? 'saldo não informado' : c.tipo === 'cartao' ? 'em aberto (estimado)' : 'saldo estimado'}</div></button>`;
    }).join('')}</div>
  </div>

  <div class="panel">
    <div class="row between"><h2>Últimas transações</h2><button type="button" class="btn small" data-aba="transacoes">Todas ›</button></div>
    <div class="list">${cls.filter(x => x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm)).slice(0, 8).map(itemTx).join('') || '<div class="empty">Nada neste mês ainda.</div>'}</div>
  </div>`;
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
  el.innerHTML = `<div class="panel">
    ${navMes(mes)}
    <span class="label">${esc(cat)}</span>
    <div class="big">${brl(total)}</div>
    <div class="sub">Média dos 11 meses anteriores: ${brl(media)}</div>
    <div id="chCat" class="chart"></div>
  </div>
  <div class="panel"><h2>Transações</h2><div class="list">${doMes.map(itemTx).join('') || '<div class="empty">Nada neste mês.</div>'}</div></div>`;
  graficoMeses(el.querySelector('#chCat')!, meses.map(m => (receita ? { ...m, saidas: 0 } : { ...m, entradas: 0 })), mes);
}

export function telaSemCategoria(el: HTMLElement) {
  const mes = mesAtual();
  const lista = classificadas().filter(x => !x.c && contaNoTotal(x.t) && x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data));
  el.innerHTML = `<div class="panel">${navMes(mes)}
    <div class="sub">Entradas e saídas que nenhuma palavra-chave nem regra conseguiu categorizar. Toque para escolher a categoria; marque “aplicar às parecidas” para o app aprender.</div>
    <div class="row"><button type="button" class="btn small" data-ir="categorias">Editar palavras-chave ›</button></div></div>
  <div class="panel"><div class="list">${lista.map(itemTx).join('') || '<div class="empty">Tudo categorizado neste mês. 🎉</div>'}</div></div>`;
}

export function telaFora(el: HTMLElement) {
  const mes = mesAtual();
  const lista = classificadas().filter(x => !contaNoTotal(x.t) && x.data.slice(0, 7) === mes).sort((a, b) => b.data.localeCompare(a.data));
  el.innerHTML = `<div class="panel">${navMes(mes)}
    <div class="sub">Dinheiro seu mudando de lugar: caixinha/reserva, transferência entre suas contas, Pix para você mesmo e pagamento de fatura (as compras do cartão já contam como saída na data da compra). Nada disso entra nas entradas e saídas.</div>
    <div class="note">Se algo aqui for entrada ou gasto de verdade, toque e mude o tipo.</div></div>
  <div class="panel"><div class="list">${lista.map(itemTx).join('') || '<div class="empty">Nada neste mês.</div>'}</div></div>`;
}

export function mudarMes(delta: number) {
  const novo = somaMes(mesAtual(), delta);
  if (novo > hoje().slice(0, 7)) return;
  state.dados.config.mes = novo; // preferência de tela: gravada junto na próxima mudança
}
