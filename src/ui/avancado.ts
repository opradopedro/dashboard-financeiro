// Ajustes → Avançado: filtro das notificações (antes das regras, vale também para o aviso do
// Android) e o registro de tudo o que o app leu, com o que aconteceu com cada uma.
import { cancelarAvisos, mudar, nomeApp, state } from '../app';
import { MAX_NOTIFS, reprocessar } from '../core/ingestao';
import { motivoFiltro } from '../core/regras';
import { STATUS_NOTIF, type FiltroNotif, type Notificacao } from '../core/tipos';
import { norm } from '../core/util';
import { $, esc, fmtD, fmtQuando, toast } from './fmt';

/** Rótulo curto do destino de uma notificação no registro. */
export const destinoNotif = (n: Notificacao) => (n.filtro ? 'Filtrada' : STATUS_NOTIF[n.status]);

/** Por que a notificação terminou assim, em uma frase. */
export function porqueNotif(n: Notificacao) {
  if (n.filtro) return `Ignorada pelo filtro: ${motivoFiltro(n.filtro)}.`;
  const regra = n.regra ? state.dados.regras.find(r => r.id === n.regra) : undefined;
  if (n.status === 'ignorada') return regra ? `Ignorada pela regra ${regra.nome}.` : 'Ignorada por uma regra.';
  if (n.status === 'transacao') return regra ? `Virou transação pela regra ${regra.nome}.` : 'Virou transação.';
  if (n.status === 'erro') return n.erro || 'Erro na regra.';
  return 'Nenhuma regra casou.';
}

/** Grava o filtro e passa de novo as notificações pendentes ou filtradas (as que viraram transação ficam). */
async function salvarFiltro(f: FiltroNotif) {
  const antes = state.dados.notifs.filter(n => n.filtro).length;
  await mudar(d => {
    const d2 = { ...d, config: { ...d.config, filtroNotif: f } };
    return reprocessar(d2, d2.notifs.filter(n => n.filtro || n.status === 'sem-regra' || n.status === 'erro').map(n => n.id));
  });
  const agora = state.dados.notifs.filter(n => n.filtro);
  cancelarAvisos(agora.map(n => n.id));
  const dif = agora.length - antes;
  toast(dif > 0 ? `Filtro salvo: mais ${dif === 1 ? '1 notificação do registro ficou filtrada' : `${dif} do registro ficaram filtradas`}.`
    : dif < 0 ? `Filtro salvo: ${-dif === 1 ? '1 notificação voltou' : `${-dif} voltaram`} para as regras.` : 'Filtro salvo.');
  dispatchEvent(new Event('rerender'));
}

export function telaAvancado(el: HTMLElement) {
  const d = state.dados;
  const f = d.config.filtroNotif;
  const ns = d.notifs;
  const conta = (p: (n: Notificacao) => boolean) => ns.filter(p).length;
  const resumo: [string, string, number][] = [
    ['transacao', 'Viraram transação', conta(n => n.status === 'transacao')],
    ['filtrada', 'Filtradas', conta(n => !!n.filtro)],
    ['ignorada', 'Ignoradas por regra', conta(n => n.status === 'ignorada' && !n.filtro)],
    ['sem-regra', 'Sem regra ou com erro', conta(n => n.status === 'sem-regra' || n.status === 'erro')],
  ];
  const ultimas = ns.slice(-40).reverse();
  el.innerHTML = `<section class="caixa">
    <h2>Filtro das notificações</h2>
    <p class="sub">Vale antes das regras e também para o aviso com Ignorar e Adicionar: a notificação filtrada fica só no registro, sem aviso e sem virar transação.</p>
    <label class="check"><input type="checkbox" id="exigirValor"${f.exigirValor ? ' checked' : ''}> Só considerar as que falam de dinheiro (têm “$”, como R$ ou US$, ou a palavra “reais”). Propaganda e novidade sem valor ficam de fora.</label>
    <div class="field full"><span class="label">Sempre ignorar as que têm</span>
      <div class="folha"><div class="list">${f.palavras.map((p, i) => `<div class="item"><div class="name">${esc(p)}</div><div class="val"><button type="button" class="btn small" data-tirar="${i}">Tirar</button></div></div>`).join('')
        || '<div class="empty">Nenhuma palavra.</div>'}</div></div></div>
    <form id="fPalavra" class="form" autocomplete="off">
      <div class="field full"><label for="palavra">Nova palavra ou trecho</label><input id="palavra" placeholder="ex.: consórcio, seguro, limite" autocapitalize="off"></div>
      <div class="row full"><button class="btn small" type="submit">Adicionar</button></div>
    </form>
    <p class="note">Acento e maiúsculas não importam (“emprestimo” pega “Empréstimo”), e vale como trecho: “empréstimo” também pega “empréstimos”.</p>
  </section>
  <section class="panel">
    <h2>Registro do que o app leu</h2>
    <p class="sub">Toda notificação dos apps monitorados fica guardada aqui com o que aconteceu com ela, inclusive as filtradas e ignoradas, para você conferir se passou algo que não devia (ou se entrou algo que não devia). Guarda as ${MAX_NOTIFS.toLocaleString('pt-BR')} mais recentes${ns.length ? `; a mais antiga é de ${fmtD(new Date(ns[0].quando).toISOString().slice(0, 10))}` : ''}.</p>
    <div class="folha"><div class="list">${resumo.map(([s, t, n]) => `<button type="button" class="item" data-aba="notificacoes?status=${s}"><div class="name">${t}</div><div class="val">${n}</div><div class="meta"></div><div class="meta r"></div></button>`).join('')}</div></div>
    <h3>Últimas lidas</h3>
    <div class="folha"><div class="list">${ultimas.map(n => `<button type="button" class="item" data-ir="notif/${encodeURIComponent(n.id)}">
      <div class="name">${esc(n.titulo || 'Sem título')}</div><div class="val"><span class="tag ${n.filtro || n.status === 'ignorada' ? 'muted' : n.status === 'transacao' ? 'ok' : 'warn'}">${destinoNotif(n)}</span></div>
      <div class="meta clamp">${esc(n.texto)}</div><div class="meta r">${esc(nomeApp(n.pacote))}<br>${fmtQuando(n.quando)}</div>
      <div class="meta full">${esc(porqueNotif(n))}</div></button>`).join('') || '<div class="empty">Nada lido ainda.</div>'}</div></div>
    ${ns.length > ultimas.length ? '<button type="button" class="btn small" data-aba="notificacoes">Ver o registro inteiro</button>' : ''}
  </section>`;
  ($('#exigirValor') as HTMLInputElement).onchange = e => void salvarFiltro({ ...f, exigirValor: (e.target as HTMLInputElement).checked });
  el.querySelectorAll<HTMLButtonElement>('[data-tirar]').forEach(b => (b.onclick = () => void salvarFiltro({ ...f, palavras: f.palavras.filter((_, i) => i !== +b.dataset.tirar!) })));
  $('#fPalavra').onsubmit = e => {
    e.preventDefault();
    const p = ($('#palavra') as HTMLInputElement).value.trim();
    if (!norm(p).trim()) { toast('Escreva uma palavra.'); return; }
    if (f.palavras.some(x => norm(x) === norm(p))) { toast('Essa palavra já está na lista.'); return; }
    void salvarFiltro({ ...f, palavras: [...f.palavras, p] });
  };
}
