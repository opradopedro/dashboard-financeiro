// Transações: lista com filtros, lançamento manual e edição (tipo, categoria, aplicar às parecidas).
import { classificadas, excluirTx, mudar, nomeApp, nomeConta, salvarTx, state } from '../app';
import { SEM_CATEGORIA } from '../core/classificar';
import { ORIGENS, TIPOS, type TipoTx, type Transacao } from '../core/tipos';
import { arred, hoje, norm, parseValor, termoDe, uid } from '../core/util';
import { $, esc, fmtD, fmtQuando, opcoes, sinal, toast } from './fmt';
import { listaPorDia, mesAtual, navMes } from './painel';
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
  const cats = d.categorias;
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
      <div class="field"><label for="tCat">Categoria</label><select id="tCat"><option value="">${SEM_CATEGORIA}</option>${opcoes(cats.map(c => ({ v: c.nome, t: c.nome + (c.receita ? ' (entrada)' : '') })), cat)}</select></div>
      <div class="field full"><label for="tNota">Observação</label><input id="tNota" value="${esc(base.nota || '')}"></div>
      ${termo ? `<label class="check full"><input type="checkbox" id="tParecidas"> Aplicar tipo e categoria a todas que contêm “${esc(termo)}” (inclusive as próximas)</label>` : ''}
      <div class="row full"><button class="btn primary" type="submit">${nova ? 'Lançar' : 'Salvar'}</button>
        ${x && (x.tipoUsuario || x.cat) ? '<button type="button" class="btn" id="btnAuto">Voltar ao automático</button>' : ''}
        ${x ? '<button type="button" class="btn danger" id="btnExcluir">Excluir</button>' : ''}</div>
    </form>
    <p class="note">Caixinha, transferência interna e pagamento de fatura não contam nas entradas e saídas. Estorno no cartão: tipo Saída com dinheiro Entrou (desconta do gasto).</p>
  </section>
  ${x ? `<section class="panel"><h2>De onde veio</h2><div class="folha"><div class="list">${x.origens.map(o => `<div class="item">
      <div class="name">${ORIGENS[o.tipo]}</div><div class="val">${sinal(o.valor)}</div>
      <div class="meta">${esc(o.desc)}, ${fmtD(o.data)}${o.arquivo ? `<br>${esc(o.arquivo)}` : ''}</div>
      <div class="meta r">${o.tipo === 'notificacao' ? `<button type="button" class="btn small" data-ir="notif/${encodeURIComponent(o.ref)}">Ver notificação</button>` : o.em ? fmtQuando(Date.parse(o.em)) : ''}</div></div>`).join('') || '<div class="empty">Lançada à mão.</div>'}</div></div>
    ${x.origens.some(o => o.tipo === 'extrato') ? '<p class="note">Quando há extrato, os dados dele prevalecem; as outras origens ficam guardadas como chegaram.</p>' : ''}</section>` : ''}`;

  $('#tTipo').onchange = () => { ($('#tSentido') as HTMLSelectElement).value = sentidoDe(($('#tTipo') as HTMLSelectElement).value as TipoTx); };
  $('#fTx').onsubmit = async e => {
    e.preventDefault();
    const v = (s: string) => ($(s) as HTMLInputElement).value.trim();
    const valor = Math.abs(parseValor(v('#tValor')));
    if (!Number.isFinite(valor) || valor === 0) { toast('Valor inválido.'); return; }
    const tipoSel = v('#tTipo') as TipoTx;
    const catSel = v('#tCat');
    const t: Transacao = { ...base, data: v('#tData'), desc: v('#tDesc'), conta: v('#tConta'), valor: arred(v('#tSentido') === 'sai' ? -valor : valor) };
    if (v('#tNota')) t.nota = v('#tNota'); else delete t.nota;
    // Tipo e categoria só ficam "fixos" se você mudou o que o app tinha decidido.
    if (nova) { t.tipoUsuario = tipoSel; t.origens = [{ tipo: 'manual', ref: t.id, em: t.criadoEm, data: t.data, desc: t.desc, valor: t.valor }]; if (catSel) t.cat = catSel; }
    else {
      if (tipoSel !== x!.t) t.tipoUsuario = tipoSel;
      if (catSel !== x!.c) { if (catSel) t.cat = catSel; else { delete t.cat; } }
    }
    const parecidas = ($('#tParecidas') as HTMLInputElement | null)?.checked;
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

/** Linha curta de uma transação (para revisão e conferência). */
export const linhaTx = (t: Transacao, extra = '') => `<div class="mini-tx"><b>${sinal(t.valor)}</b> em ${fmtD(t.data)}, ${esc(t.desc)}
  <span class="sub">${t.origens.map(o => ORIGENS[o.tipo] + (o.tipo === 'notificacao' ? ` (${esc(nomeApp(state.dados.notifs.find(n => n.id === o.ref)?.pacote || ''))})` : '')).join(' + ')}</span>${extra}</div>`;


