// Transações: lista com filtros, lançamento manual e edição (tipo, categoria, aplicar às parecidas).
import { classificadas, excluirTx, mudar, nomeApp, nomeConta, salvarTx, state } from '../app';
import { SEM_CATEGORIA, type Classificada } from '../core/classificar';
import { ORIGENS, TIPOS, type TipoTx, type Transacao } from '../core/tipos';
import { arred, hoje, norm, parseValor, termoDe, uid } from '../core/util';
import { $, esc, fmtD, fmtQuando, opcoes, sinal, toast } from './fmt';
import { campoCategoria, confirmar, ligarCampoCategoria, valorCampo } from './escolher';
import { transacaoIgual } from '../core/duplicadas';
import { itemTx, listaPorDia, mesAtual, navMes } from './painel';
import type { Rota } from './nav';
import { trocar, voltar } from './nav';

export function telaTransacoes(el: HTMLElement, r: Rota) {
  const d = state.dados;
  const mes = mesAtual();
  const conta = r.query.get('conta') || '';
  const tipo = r.query.get('tipo') || '';
  const busca = r.query.get('q') || '';
  const todas = classificadas();
  const t = norm(busca).trim();
  const lista = todas.filter(x => (busca ? true : x.data.slice(0, 7) === mes) && (!conta || x.conta === conta)
    && (!tipo || (tipo === 'semcat' ? !x.c && (x.t === 'entrada' || x.t === 'saida') : x.t === tipo))
    && (!t || norm(x.desc).includes(t) || norm(x.c).includes(t)))
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  const total = lista.reduce((s, x) => s + x.valor, 0);
  el.innerHTML = `<section class="fita">
    ${busca ? '' : navMes(mes)}
    <form id="fFiltro" class="form">
      <div class="field full"><label for="fq">Buscar (em todos os meses)</label><input id="fq" type="search" value="${esc(busca)}" placeholder="descrição ou categoria"></div>
      <div class="field"><label for="fConta">Conta</label><select id="fConta"><option value="">Todas</option>${opcoes(d.contas.map(c => ({ v: c.id, t: c.nome })), conta)}</select></div>
      <div class="field"><label for="fTipo">Tipo</label><select id="fTipo"><option value="">Todos</option>${opcoes([...Object.entries(TIPOS).map(([v, t]) => ({ v, t })), { v: 'semcat', t: SEM_CATEGORIA }], tipo)}</select></div>
    </form>
    <div class="row between"><span class="sub">${lista.length === 1 ? '1 transação' : `${lista.length} transações`}, somando ${sinal(total)}</span>
      <button type="button" class="btn primary small" data-ir="tx/novo">Lançar transação</button></div>
  </section>
  <div class="folha"><div class="list">${listaPorDia(lista.slice(0, 400)) || '<div class="empty">Nenhuma transação com estes filtros.</div>'}</div></div>
  ${lista.length > 400 ? '<p class="note">Mostrando as 400 mais recentes. Use os filtros para achar as outras.</p>' : ''}`;
  const aplicar = () => {
    const q = new URLSearchParams();
    const v = (id: string) => ($(id) as HTMLInputElement).value.trim();
    if (v('#fConta')) q.set('conta', v('#fConta'));
    if (v('#fTipo')) q.set('tipo', v('#fTipo'));
    if (v('#fq')) q.set('q', v('#fq'));
    trocar('transacoes' + (q.toString() ? '?' + q : ''));
  };
  $('#fConta').onchange = aplicar;
  $('#fTipo').onchange = aplicar;
  $('#fFiltro').onsubmit = e => { e.preventDefault(); aplicar(); };
  $('#fq').onchange = aplicar;
}

const sentidoDe = (t: TipoTx) => (t === 'entrada' ? 'entra' : 'sai');

export function telaTx(el: HTMLElement, id: string) {
  const d = state.dados;
  const nova = id === 'novo';
  const x = nova ? null : classificadas().find(t => t.id === id);
  if (!nova && !x) { el.innerHTML = '<div class="panel"><div class="empty">Transação não encontrada (talvez tenha sido excluída).</div></div>'; return; }
  const base: Transacao = x || { id: uid('t'), conta: d.contas.find(c => c.ativa)?.id || '', data: hoje(), desc: '', valor: 0, origens: [], criadoEm: new Date().toISOString() };
  const tipo: TipoTx = x?.t || 'saida';
  const cat = x?.c || '';
  const termo = x ? termoDe(x.desc) : '';

  el.innerHTML = `
  ${x ? `<section class="fita">
    <p class="label">${esc(nomeConta(x.conta))}, ${fmtD(x.data)}</p>
    <div class="big">${sinal(x.valor)}</div>
    <p class="frase">${esc(x.desc)}</p>
  </section>` : ''}
  <section class="panel">
    ${x ? '<h2>Editar</h2>' : ''}
    <form id="fTx" class="form" autocomplete="off">
      <div class="field"><label for="tData">Data</label><input id="tData" type="date" value="${esc(base.data)}" required></div>
      <div class="field"><label for="tValor">Valor (R$)</label><input id="tValor" inputmode="decimal" value="${base.valor ? esc(Math.abs(base.valor).toFixed(2).replace('.', ',')) : ''}" placeholder="0,00" required></div>
      <div class="field full"><label for="tDesc">Descrição</label><input id="tDesc" value="${esc(base.desc)}" required></div>
      <div class="field"><label for="tTipo">Tipo</label><select id="tTipo">${opcoes(Object.entries(TIPOS).map(([v, t]) => ({ v, t })), tipo)}</select></div>
      <div class="field"><label for="tSentido">Dinheiro</label><select id="tSentido">${opcoes([{ v: 'sai', t: 'Saiu (gasto/compra)' }, { v: 'entra', t: 'Entrou (ou estorno)' }], x ? (x.valor > 0 ? 'entra' : 'sai') : 'sai')}</select></div>
      <div class="field"><label for="tConta">Conta</label><select id="tConta">${opcoes(d.contas.filter(c => c.ativa || c.id === base.conta).map(c => ({ v: c.id, t: c.nome })), base.conta)}</select></div>
      <div class="field"><label for="tCat">Categoria</label>${campoCategoria('tCat', cat)}</div>
      <div class="field full"><label for="tNota">Observação</label><input id="tNota" value="${esc(base.nota || '')}"></div>
      ${x ? `<label class="check full"><input type="checkbox" id="tParecidas"> Aplicar este tipo e esta categoria a todas que contêm o trecho abaixo, inclusive as próximas</label>
      <div class="field full"><label for="tTermo">Trecho da descrição</label><input id="tTermo" value="${esc(termo)}" autocapitalize="off" spellcheck="false">
        <span class="note">Deixe só o que identifica (ex.: o nome de quem paga). Vale para extrato e notificação.</span></div>` : ''}
      <div class="row full"><button class="btn primary" type="submit">${nova ? 'Lançar' : 'Salvar'}</button>
        ${x && (x.tipoUsuario || x.cat) ? '<button type="button" class="btn" id="btnAuto">Voltar ao automático</button>' : ''}
        ${x ? '<button type="button" class="btn danger" id="btnExcluir">Excluir</button>' : ''}</div>
    </form>
    <p class="note">Caixinha, transferência interna e pagamento de fatura não contam nas entradas e saídas. Estorno no cartão: tipo Saída com dinheiro Entrou (desconta do gasto).</p>
  </section>
  ${x ? blocoPar(x) : ''}
  ${x ? `<section class="panel"><h2>De onde veio</h2><div class="folha"><div class="list">${x.origens.map(o => `<div class="item">
      <div class="name">${ORIGENS[o.tipo]}</div><div class="val">${sinal(o.valor)}</div>
      <div class="meta">${esc(o.desc)}, ${fmtD(o.data)}${o.arquivo ? `<br>${esc(o.arquivo)}` : ''}</div>
      <div class="meta r">${o.tipo === 'notificacao' ? `<button type="button" class="btn small" data-ir="notif/${encodeURIComponent(o.ref)}">Ver notificação</button>` : o.em ? fmtQuando(Date.parse(o.em)) : ''}</div></div>`).join('') || '<div class="empty">Lançada à mão.</div>'}</div></div>
    ${x.origens.some(o => o.tipo === 'extrato') ? '<p class="note">Quando há extrato, os dados dele prevalecem; as outras origens ficam guardadas como chegaram.</p>' : ''}</section>` : ''}`;

  ligarCampoCategoria('tCat', { receita: () => ($('#tSentido') as HTMLSelectElement).value === 'entra' });
  $('#tTipo').onchange = () => { ($('#tSentido') as HTMLSelectElement).value = sentidoDe(($('#tTipo') as HTMLSelectElement).value as TipoTx); };
  $('#fTx').onsubmit = async e => {
    e.preventDefault();
    const v = (s: string) => ($(s) as HTMLInputElement).value.trim();
    const valor = Math.abs(parseValor(v('#tValor')));
    if (!Number.isFinite(valor) || valor === 0) { toast('Valor inválido.'); return; }
    const tipoSel = v('#tTipo') as TipoTx;
    const catSel = valorCampo('tCat');
    const t: Transacao = { ...base, data: v('#tData'), desc: v('#tDesc'), conta: v('#tConta'), valor: arred(v('#tSentido') === 'sai' ? -valor : valor) };
    if (v('#tNota')) t.nota = v('#tNota'); else delete t.nota;
    // Tipo e categoria só ficam "fixos" se você mudou o que o app tinha decidido.
    if (nova) { t.tipoUsuario = tipoSel; t.origens = [{ tipo: 'manual', ref: t.id, em: t.criadoEm, data: t.data, desc: t.desc, valor: t.valor }]; if (catSel) t.cat = catSel; }
    else {
      if (tipoSel !== x!.t) t.tipoUsuario = tipoSel;
      if (catSel !== x!.c) { if (catSel) t.cat = catSel; else { delete t.cat; } }
    }
    // Igual a uma que já existe? (lançada à mão de novo, ou já veio por notificação/extrato)
    const igual = transacaoIgual(state.dados.txs, t);
    if (igual && (nova || igual.exata)) {
      const o = igual.tx, nome = tipoSel === 'entrada' ? 'uma entrada' : tipoSel === 'saida' ? 'uma saída' : 'uma transação';
      const desc = `${o.desc}, ${sinal(o.valor)} em ${fmtD(o.data)}, ${nomeConta(o.conta)}`;
      const ok = await confirmar(igual.exata ? 'Transação repetida' : 'Transação parecida',
        igual.exata ? `Já existe ${nome} exatamente como essa: ${desc}. Deseja continuar?`
          : `Já existe ${nome} com a mesma conta e o mesmo valor${o.data === t.data ? ' no mesmo dia' : ' um dia antes ou depois'}: ${desc}. Pode ser a mesma (ex.: veio por notificação). Deseja continuar?`,
        { sim: nova ? 'Lançar mesmo assim' : 'Salvar mesmo assim' });
      if (!ok) return;
    }
    const parecidas = ($('#tParecidas') as HTMLInputElement | null)?.checked;
    const termo = norm(($('#tTermo') as HTMLInputElement | null)?.value || '').trim();
    await salvarTx(t);
    if (parecidas && termo) {
      await mudar(dd => ({ ...dd, regrasCat: [...dd.regrasCat.filter(r => r.termo !== termo), { id: uid('rc'), termo, tipo: tipoSel, ...(catSel ? { cat: catSel } : {}) }] }));
      toast(`Regra criada para “${termo}”.`);
    } else toast(nova ? 'Lançada.' : 'Salvo.');
    voltar();
  };
  $('#btnAuto')?.addEventListener('click', async () => {
    const t = { ...x! } as Transacao & Record<string, unknown>;
    for (const k of ['t', 'c', 'auto', 'tipoUsuario', 'cat']) delete t[k];
    await salvarTx(t);
    toast('Voltou ao automático.');
    dispatchEvent(new Event('rerender'));
  });
  $('#btnExcluir')?.addEventListener('click', async () => {
    const extrato = x!.origens.some(o => o.tipo === 'extrato');
    if (!confirm(`Excluir esta transação?${extrato ? '\n\nEla veio de extrato: reimportar o mesmo arquivo não vai trazê-la de volta.' : ''}`)) return;
    await excluirTx(x!.id);
    toast('Excluída.');
    voltar();
  });
}

/** A outra ponta: o Pix que pagou a fatura, a fatura que ele pagou, ou a transferência entre contas suas. */
function blocoPar(x: Classificada) {
  const p = x.par ? classificadas().find(t => t.id === x.par) : undefined;
  if (!p) return '';
  const cartao = state.dados.contas.find(c => c.id === x.conta)?.tipo === 'cartao';
  const titulo = x.t === 'fatura' ? (cartao ? 'Paga com' : 'Pagou a fatura') : 'A outra ponta';
  const nota = x.t === 'fatura'
    ? 'As duas ficam fora de entradas e gastos: o gasto já contou em cada compra do cartão.'
    : 'Dinheiro seu indo de uma conta sua para outra: não conta como entrada nem gasto.';
  return `<section class="panel"><h2>${titulo}</h2><div class="folha"><div class="list">${itemTx(p, true)}</div></div><p class="note">${nota}</p></section>`;
}

/** Linha curta de uma transação (para revisão e conferência). */
export const linhaTx = (t: Transacao, extra = '') => `<div class="mini-tx"><b>${sinal(t.valor)}</b> em ${fmtD(t.data)}, ${esc(t.desc)}
  <span class="sub">${t.origens.map(o => ORIGENS[o.tipo] + (o.tipo === 'notificacao' ? ` (${esc(nomeApp(state.dados.notifs.find(n => n.id === o.ref)?.pacote || ''))})` : '')).join(' + ')}</span>${extra}</div>`;


