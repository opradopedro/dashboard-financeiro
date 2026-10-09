// Registro de notificações capturadas, detalhe (criar regra, reprocessar) e simulador.
import { consumirFila, nomeApp, reprocessarNotifs, state } from '../app';
import { STATUS_NOTIF, type StatusNotif } from '../core/tipos';
import { nativo } from '../nativo/notificacoes';
import { $, esc, fmtQuando, opcoes, sinal, toast } from './fmt';
import { ir, trocar, type Rota } from './nav';

const corStatus: Record<StatusNotif, string> = { transacao: 'gain', ignorada: 'muted', 'sem-regra': 'warn', erro: 'loss' };
const tagStatus = (s: StatusNotif) => `<span class="tag" style="color:var(--${corStatus[s]})">${STATUS_NOTIF[s]}</span>`;

export function telaNotificacoes(el: HTMLElement, r: Rota) {
  const d = state.dados;
  const status = r.query.get('status') || '';
  const app = r.query.get('app') || '';
  const lista = d.notifs.filter(n => (!status || n.status === status || (status === 'sem-regra' && n.status === 'erro')) && (!app || n.pacote === app)).slice().reverse();
  const semRegra = d.notifs.filter(n => n.status === 'sem-regra' || n.status === 'erro');
  el.innerHTML = `<div class="panel">
    <div class="sub">Todas as notificações dos apps monitorados ficam aqui com o texto bruto. Notificações de outros apps são descartadas sem gravar nada.</div>
    <div class="row">
      <button type="button" class="btn primary small" data-ir="simular">Simular notificação</button>
      <button type="button" class="btn small" data-ir="regras">Regras ›</button>
      ${semRegra.length ? `<button type="button" class="btn small" id="btnReprocTodas">Reprocessar ${semRegra.length} sem regra</button>` : ''}
    </div>
    <form class="form" id="fNotif">
      <div class="field"><label for="nStatus">Status</label><select id="nStatus"><option value="">Todos</option>${opcoes(Object.entries(STATUS_NOTIF).map(([v, t]) => ({ v, t })), status)}</select></div>
      <div class="field"><label for="nApp">App</label><select id="nApp"><option value="">Todos</option>${opcoes(d.apps.map(a => ({ v: a.pacote, t: a.nome })), app)}</select></div>
    </form>
  </div>
  <div class="panel"><div class="list">${lista.slice(0, 300).map(n => `<button type="button" class="item" data-ir="notif/${encodeURIComponent(n.id)}">
      <div class="name">${esc(n.titulo || '(sem título)')}</div><div class="val">${tagStatus(n.status)}</div>
      <div class="meta clamp">${esc(n.texto)}</div>
      <div class="meta r">${esc(nomeApp(n.pacote))}${n.simulada ? ' · simulada' : ''}<br>${fmtQuando(n.quando)}</div></button>`).join('')
      || '<div class="empty">Nenhuma notificação registrada ainda. Assim que um app monitorado notificar, ela aparece aqui (mesmo com o app fechado).</div>'}</div></div>`;
  const filtrar = () => {
    const q = new URLSearchParams();
    const s = ($('#nStatus') as HTMLSelectElement).value, a = ($('#nApp') as HTMLSelectElement).value;
    if (s) q.set('status', s);
    if (a) q.set('app', a);
    trocar('notificacoes' + (q.toString() ? '?' + q : ''));
  };
  $('#nStatus').onchange = filtrar;
  $('#nApp').onchange = filtrar;
  $('#btnReprocTodas')?.addEventListener('click', async () => {
    await reprocessarNotifs(semRegra.map(n => n.id));
    const ok = state.dados.notifs.filter(n => semRegra.some(s => s.id === n.id) && n.status === 'transacao').length;
    toast(`${ok} de ${semRegra.length} viraram transação.`);
  });
}

export function telaNotif(el: HTMLElement, id: string) {
  const d = state.dados;
  const n = d.notifs.find(x => x.id === id);
  if (!n) { el.innerHTML = '<div class="panel"><div class="empty">Notificação não encontrada.</div></div>'; return; }
  const regra = d.regras.find(r => r.id === n.regra);
  const tx = d.txs.find(t => t.id === n.tx);
  el.innerHTML = `<div class="panel">
    <span class="label">${esc(nomeApp(n.pacote))} · ${fmtQuando(n.quando)}${n.simulada ? ' · simulada' : ''}</span>
    <div class="row">${tagStatus(n.status)}</div>
    <div class="bruto"><b>${esc(n.titulo)}</b>\n${esc(n.texto)}</div>
    <div class="note">Pacote: <code>${esc(n.pacote)}</code></div>
    ${n.erro ? `<div class="err">${esc(n.erro)}</div>` : ''}
    ${regra ? `<div class="sub">Regra: <a href="#/regra/${encodeURIComponent(regra.id)}" data-ir="regra/${esc(regra.id)}">${esc(regra.nome)}</a></div>` : ''}
    ${tx ? `<button type="button" class="item" data-ir="tx/${esc(tx.id)}"><div class="name">${esc(tx.desc)}</div><div class="val">${sinal(tx.valor)} ›</div><div class="meta">Transação criada</div><div class="meta r"></div></button>`
      : n.tx ? '<div class="note">A transação desta notificação foi excluída.</div>' : ''}
    <div class="row">
      <button type="button" class="btn primary" data-ir="regra/nova?de=${encodeURIComponent(n.id)}">Criar regra a partir desta</button>
      <button type="button" class="btn" id="btnReproc">Reprocessar</button>
    </div>
    <div class="note">Reprocessar passa a notificação de novo pelas regras atuais. Se ela já tinha virado transação, a transação é refeita mantendo o tipo e a categoria que você escolheu.</div>
  </div>`;
  $('#btnReproc').onclick = async () => {
    await reprocessarNotifs([n.id]);
    const novo = state.dados.notifs.find(x => x.id === n.id);
    toast(novo ? STATUS_NOTIF[novo.status] : 'Reprocessada.');
    dispatchEvent(new Event('rerender'));
  };
}

export function telaSimular(el: HTMLElement) {
  const d = state.dados;
  const ativos = d.apps.filter(a => a.ativo);
  el.innerHTML = `<div class="panel">
    <div class="sub">A notificação simulada entra pela mesma fila e passa pelas mesmas regras das reais, e fica marcada como “simulada” no registro.</div>
    <form id="fSim" class="form">
      <div class="field full"><label for="sApp">App</label><select id="sApp">${opcoes(ativos.map(a => ({ v: a.pacote, t: `${a.nome} (${a.pacote})` })))}</select></div>
      <div class="field full"><label for="sTit">Título</label><input id="sTit" placeholder="Compra aprovada"></div>
      <div class="field full"><label for="sTxt">Texto</label><textarea id="sTxt" rows="4" placeholder="Compra de R$ 52,00 APROVADA em PADARIA X para o cartão com final 1234."></textarea></div>
      <div class="row full"><button class="btn primary" type="submit">Enviar</button></div>
    </form>
    ${ativos.length ? '' : '<div class="err">Nenhum app monitorado ativo. Ative um em Ajustes → Apps monitorados.</div>'}
  </div>`;
  $('#fSim').onsubmit = async e => {
    e.preventDefault();
    const pacote = ($('#sApp') as HTMLSelectElement).value;
    const titulo = ($('#sTit') as HTMLInputElement).value, texto = ($('#sTxt') as HTMLTextAreaElement).value;
    if (!titulo.trim() && !texto.trim()) { toast('Escreva o título ou o texto.'); return; }
    const { aceita } = await nativo.simular({ pacote, titulo, texto });
    if (!aceita) { toast('O serviço recusou: o app não está na lista monitorada.'); return; }
    await consumirFila();
    const n = [...state.dados.notifs].reverse().find(x => x.simulada && x.pacote === pacote && x.texto === texto);
    if (n) { toast(STATUS_NOTIF[n.status]); trocar('notificacoes'); ir(`notif/${encodeURIComponent(n.id)}`); }
  };
}
