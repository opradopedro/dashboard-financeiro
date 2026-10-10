// Registro de notificações capturadas, detalhe (adicionar, ignorar, criar regra, reprocessar) e simulador.
import { consumirFila, decidir, nomeApp, reprocessarNotifs, state } from '../app';
import { gerarRegraAuto } from '../core/automatica';
import { ACOES, STATUS_NOTIF, type Notificacao, type StatusNotif } from '../core/tipos';
import { motivoFiltro } from '../core/regras';
import { nativo } from '../nativo/notificacoes';
import { $, esc, fmtQuando, opcoes, sinal, toast } from './fmt';
import { ir, trocar, type Rota } from './nav';

const corStatus: Record<StatusNotif, string> = { transacao: 'ok', ignorada: 'muted', 'sem-regra': 'warn', erro: 'err' };
const tagStatus = (s: StatusNotif) => `<span class="tag ${corStatus[s]}">${STATUS_NOTIF[s]}</span>`;

const FILTROS: [string, string][] = [['', 'Todas'], ['sem-regra', 'Sem regra'], ['transacao', 'Viraram transação'], ['ignorada', 'Ignoradas'], ['filtrada', 'Filtradas']];
const tagDe = (n: Notificacao) => (n.filtro ? '<span class="tag muted">Filtrada</span>' : tagStatus(n.status));
/** Status do filtro da lista: "ignorada" = por regra; "filtrada" = pelo filtro de Ajustes → Avançado. */
const passaStatus = (n: Notificacao, s: string) => !s || (s === 'filtrada' ? !!n.filtro
  : s === 'ignorada' ? n.status === 'ignorada' && !n.filtro : n.status === s || (s === 'sem-regra' && n.status === 'erro'));

export function telaNotificacoes(el: HTMLElement, r: Rota) {
  const d = state.dados;
  const status = r.query.get('status') || '';
  const app = r.query.get('app') || '';
  const lista = d.notifs.filter(n => passaStatus(n, status) && (!app || n.pacote === app)).slice().reverse();
  const semRegra = d.notifs.filter(n => n.status === 'sem-regra' || n.status === 'erro');
  const q = (s: string, a = app) => { const p = new URLSearchParams(); if (s) p.set('status', s); if (a) p.set('app', a); return p.toString() ? '?' + p : ''; };
  el.innerHTML = `<section class="panel">
    <p class="sub">Tudo o que os apps monitorados notificaram, com o texto como chegou e o que aconteceu com cada uma. Propagandas sem valor e empréstimo ficam como “filtrada” (Ajustes → Avançado) e não viram transação nem aviso. Notificações de outros apps nem são lidas.</p>
    <div class="row">
      <button type="button" class="btn small" data-ir="regras">Regras</button>
      <button type="button" class="btn small" data-ir="simular">Simular notificação</button>
      <button type="button" class="btn small" data-ir="avancado">Filtro</button>
      ${semRegra.length ? `<button type="button" class="btn small" id="btnReprocTodas">Reprocessar as sem regra</button>` : ''}
    </div>
  </section>
  <div class="seg" role="group" aria-label="Filtrar por status">${FILTROS.map(([v, t]) => `<button type="button" data-filtro="${v}" aria-pressed="${v === status}">${t}</button>`).join('')}</div>
  <div class="seg" role="group" aria-label="Filtrar por app"><button type="button" data-app="" aria-pressed="${!app}">Todos os apps</button>${d.apps.map(a => `<button type="button" data-app="${esc(a.pacote)}" aria-pressed="${a.pacote === app}">${esc(a.nome)}</button>`).join('')}</div>
  <div class="folha"><div class="list">${lista.slice(0, 300).map(n => `<button type="button" class="item" data-ir="notif/${encodeURIComponent(n.id)}">
      <div class="name">${esc(n.titulo || 'Sem título')}</div><div class="val">${tagDe(n)}</div>
      <div class="meta clamp">${esc(n.texto)}</div>
      <div class="meta r">${esc(nomeApp(n.pacote))}${n.simulada ? ', simulada' : ''}<br>${fmtQuando(n.quando)}</div></button>`).join('')
      || '<div class="empty">Nenhuma notificação por aqui. Assim que um app monitorado notificar, ela aparece nesta lista, mesmo com o app fechado.</div>'}</div></div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-filtro]').forEach(b => (b.onclick = () => trocar('notificacoes' + q(b.dataset.filtro!))));
  el.querySelectorAll<HTMLButtonElement>('[data-app]').forEach(b => (b.onclick = () => trocar('notificacoes' + q(status, b.dataset.app!))));
  $('#btnReprocTodas')?.addEventListener('click', async () => {
    await reprocessarNotifs(semRegra.map(n => n.id));
    const ok = state.dados.notifs.filter(n => semRegra.some(s => s.id === n.id) && n.status === 'transacao').length;
    toast(ok === 1 ? '1 virou transação.' : `${ok} viraram transação.`);
  });
}

export function telaNotif(el: HTMLElement, id: string) {
  const d = state.dados;
  const n = d.notifs.find(x => x.id === id);
  if (!n) { el.innerHTML = '<div class="empty">Esta notificação não está no registro (talvez ainda não tenha entrado: abra a aba Notificações).</div>'; return; }
  const regra = d.regras.find(r => r.id === n.regra);
  const tx = d.txs.find(t => t.id === n.tx);
  const pendente = n.status === 'sem-regra' || n.status === 'erro';
  const previa = pendente ? gerarRegraAuto(n, d) : null;
  el.innerHTML = `<section class="panel">
    <p class="label">${esc(nomeApp(n.pacote))}, ${fmtQuando(n.quando)}${n.simulada ? ', simulada' : ''}</p>
    <div class="bruto"><b>${esc(n.titulo)}</b>\n${esc(n.texto)}</div>
    <div class="row">${tagDe(n)}${regra ? `<a href="#/regra/${encodeURIComponent(regra.id)}" data-ir="regra/${esc(regra.id)}" class="sub">pela regra ${esc(regra.nome)}</a>` : ''}</div>
    ${n.erro ? `<p class="err">${esc(n.erro)}</p>` : ''}
    ${n.filtro ? `<p class="sub">Ignorada pelo filtro antes das regras: ${esc(motivoFiltro(n.filtro))}. Se devia ter virado transação, mude o filtro em <a href="#/avancado" data-ir="avancado">Ajustes → Avançado</a>.</p>` : ''}
    ${tx ? `<div class="folha"><button type="button" class="item" data-ir="tx/${esc(tx.id)}"><div class="name">${esc(tx.desc)}</div><div class="val">${sinal(tx.valor)}</div><div class="meta">Transação criada</div><div class="meta r"></div></button></div>`
      : n.tx ? '<p class="note">A transação desta notificação foi excluída.</p>' : ''}
  </section>
  ${pendente ? `<section class="caixa">
    <h3>O que fazer com ela?</h3>
    ${previa ? `<p class="sub">Adicionar cria uma regra para esta e as próximas parecidas. Esta vira <b>${ACOES[previa.acao].toLowerCase()}</b> em ${esc(d.contas.find(c => c.id === previa.conta)?.nome || '')}; dá para ajustar a regra depois.</p>`
      : '<p class="sub">Não achei um valor em R$ no texto, então não dá para virar transação sozinha. Ignore, ou crie a regra à mão.</p>'}
    <div class="row">
      ${previa ? '<button type="button" class="btn primary" id="btnAdd">Adicionar</button>' : ''}
      <button type="button" class="btn" id="btnIgn">Ignorar as com este título</button>
    </div>
  </section>` : ''}
  <section class="panel">
    <div class="row">
      <button type="button" class="btn small" data-ir="regra/nova?de=${encodeURIComponent(n.id)}">Criar regra à mão</button>
      <button type="button" class="btn small" id="btnReproc">Reprocessar</button>
      ${n.status === 'transacao' ? '<button type="button" class="btn small danger" id="btnDesfazer">Não era transação</button>' : ''}
    </div>
    <p class="note">Reprocessar passa a notificação de novo pelas regras atuais. Se ela já tinha virado transação, a transação é refeita mantendo o tipo e a categoria que você escolheu.</p>
  </section>`;
  const feito = (msg: string) => { toast(msg); dispatchEvent(new Event('rerender')); };
  $('#btnAdd')?.addEventListener('click', async () => { const [r] = await decidir([{ chave: n.id, acao: 'adicionar' }]); feito(r.msg); });
  $('#btnIgn')?.addEventListener('click', async () => { const [r] = await decidir([{ chave: n.id, acao: 'ignorar' }]); feito(r.msg); });
  $('#btnDesfazer')?.addEventListener('click', async () => { const [r] = await decidir([{ chave: n.id, acao: 'ignorar' }]); feito(r.msg); });
  $('#btnReproc').onclick = async () => {
    await reprocessarNotifs([n.id]);
    const novo = state.dados.notifs.find(x => x.id === n.id);
    feito(novo ? STATUS_NOTIF[novo.status] : 'Reprocessada.');
  };
}

export function telaSimular(el: HTMLElement) {
  const d = state.dados;
  const ativos = d.apps.filter(a => a.ativo);
  el.innerHTML = `<section class="panel">
    <p class="sub">A notificação simulada entra pela mesma fila e passa pelas mesmas regras das reais (inclusive o aviso com Ignorar e Adicionar), e fica marcada como simulada no registro.</p>
    <form id="fSim" class="form">
      <div class="field full"><label for="sApp">App</label><select id="sApp">${opcoes(ativos.map(a => ({ v: a.pacote, t: a.nome })))}</select></div>
      <div class="field full"><label for="sTit">Título</label><input id="sTit" placeholder="Compra aprovada no crédito"></div>
      <div class="field full"><label for="sTxt">Texto</label><textarea id="sTxt" rows="4" placeholder="Compra de R$ 32,00 em PADARIA realizada."></textarea></div>
      <div class="row full"><button class="btn primary" type="submit">Enviar notificação</button></div>
    </form>
    ${ativos.length ? '' : '<p class="err">Nenhum app monitorado está ativo. Ative um em Ajustes, Apps monitorados.</p>'}
  </section>`;
  $('#fSim').onsubmit = async e => {
    e.preventDefault();
    const pacote = ($('#sApp') as HTMLSelectElement).value;
    const titulo = ($('#sTit') as HTMLInputElement).value, texto = ($('#sTxt') as HTMLTextAreaElement).value;
    if (!titulo.trim() && !texto.trim()) { toast('Escreva o título ou o texto.'); return; }
    const { aceita, chave } = await nativo.simular({ pacote, titulo, texto });
    if (!aceita) { toast('O serviço recusou: este app não está na lista monitorada.'); return; }
    await consumirFila();
    const n = state.dados.notifs.find(x => x.id === chave) || [...state.dados.notifs].reverse().find(x => x.simulada && x.pacote === pacote);
    if (n) { toast(`Enviada: ${n.filtro ? 'filtrada' : STATUS_NOTIF[n.status].toLowerCase()}.`); trocar('notificacoes'); ir(`notif/${encodeURIComponent(n.id)}`); }
  };
}
