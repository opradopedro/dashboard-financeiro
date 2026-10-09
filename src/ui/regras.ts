// Regras de notificação: lista por app e editor com teste ao vivo contra um texto e contra as
// notificações já registradas.
import { enviarPacotes, mudar, nomeApp, nomeConta, state } from '../app';
import { aplicarRegra, sentidoPadrao, sugerirPadrao } from '../core/regras';
import { ACOES, type AcaoRegra, type RegraNotif } from '../core/tipos';
import { uid } from '../core/util';
import { $, esc, fmtD, opcoes, sinal, toast } from './fmt';
import { trocar, voltar, type Rota } from './nav';

export function telaRegras(el: HTMLElement) {
  const d = state.dados;
  const pacotes = [...new Set([...d.apps.map(a => a.pacote), ...d.regras.map(r => r.pacote)])];
  el.innerHTML = `<div class="panel">
    <div class="sub">Cada regra lê o texto da notificação (título e texto) com uma expressão regular. A de maior prioridade que casar decide. As regras que vieram com o app são um <b>chute</b>: ajuste com as notificações reais (Notificações → toque numa → Criar regra).</div>
    <div class="row"><button type="button" class="btn primary small" data-ir="regra/nova">+ Nova regra</button></div>
  </div>
  ${pacotes.map(p => {
    const rs = d.regras.filter(r => r.pacote === p).sort((a, b) => b.prioridade - a.prioridade);
    return `<div class="panel"><h2>${esc(nomeApp(p))}</h2><div class="list">${rs.map(r => `<button type="button" class="item${r.ativa ? '' : ' fora'}" data-ir="regra/${esc(r.id)}">
      <div class="name">${esc(r.nome)}</div><div class="val"><span class="tag">${r.prioridade}</span></div>
      <div class="meta">${ACOES[r.acao]}${r.acao === 'ignorar' ? '' : ' · ' + esc(nomeConta(r.conta))}</div><div class="meta r">${r.ativa ? '' : 'desativada'}</div></button>`).join('') || '<div class="empty">Nenhuma regra para este app.</div>'}</div></div>`;
  }).join('')}`;
}

export function telaRegra(el: HTMLElement, id: string, r: Rota) {
  const d = state.dados;
  const notif = r.query.get('de') ? d.notifs.find(n => n.id === r.query.get('de')) : undefined;
  const existente = d.regras.find(x => x.id === id);
  const nova = !existente;
  const pac = notif?.pacote || d.apps[0]?.pacote || '';
  const contaPadrao = d.contas.find(c => c.ativa && c.banco && nomeApp(pac).toLowerCase().includes(c.banco.toLowerCase().split(' ')[0]))?.id || d.contas[0]?.id || '';
  const regra: RegraNotif = existente ? { ...existente } : {
    id: uid('rn'), nome: notif ? `${nomeApp(pac)}: ${notif.titulo}`.slice(0, 60) : '', pacote: pac,
    padrao: notif ? sugerirPadrao(notif.titulo, notif.texto) : '', descricao: '', acao: 'saida', sentido: 'sai', conta: contaPadrao, prioridade: 50, ativa: true,
  };
  const pacotes = [...new Set([...d.apps.map(a => a.pacote), regra.pacote].filter(Boolean))];
  const ultima = notif || [...d.notifs].reverse().find(n => n.pacote === regra.pacote);
  el.innerHTML = `<div class="panel">
    <form id="fRegra" class="form" autocomplete="off">
      <div class="field full"><label for="rNome">Nome</label><input id="rNome" value="${esc(regra.nome)}" required></div>
      <div class="field full"><label for="rApp">App</label><select id="rApp">${opcoes(pacotes.map(p => ({ v: p, t: `${nomeApp(p)} (${p})` })), regra.pacote)}</select></div>
      <div class="field full"><label for="rPadrao">Padrão (expressão regular, ignora maiúsculas)</label>
        <textarea id="rPadrao" class="mono" rows="5" spellcheck="false" autocapitalize="off" required>${esc(regra.padrao)}</textarea></div>
      <details class="como full"><summary>Como escrever o padrão</summary>
        <p>O padrão é testado contra <b>título + quebra de linha + texto</b>. Use grupos com nome:</p>
        <p><code>(?&lt;valor&gt;…)</code> obrigatório, ex.: <code>R\\$\\s?(?&lt;valor&gt;[\\d.]+,\\d{2})</code><br>
        <code>(?&lt;desc&gt;…)</code> descrição (loja, pessoa), ex.: <code>em (?&lt;desc&gt;.+?)\\.</code><br>
        <code>(?&lt;data&gt;…)</code> opcional, dd/mm ou dd/mm/aaaa; sem ele vale o dia da notificação.</p>
        <p><code>[\\s\\S]*?</code> pula qualquer trecho (inclusive quebra de linha). <code>\\$</code> é o cifrão. <code>|</code> é “ou”.</p></details>
      <div class="field full"><label for="rDesc">Descrição da transação (opcional)</label><input id="rDesc" value="${esc(regra.descricao || '')}" placeholder="ex.: Pix de {desc} — vazio usa o grupo desc ou o título"></div>
      <div class="field"><label for="rAcao">Vira</label><select id="rAcao">${opcoes(Object.entries(ACOES).map(([v, t]) => ({ v, t })), regra.acao)}</select></div>
      <div class="field"><label for="rSentido">Dinheiro</label><select id="rSentido">${opcoes([{ v: 'sai', t: 'Saiu (negativo)' }, { v: 'entra', t: 'Entrou (positivo)' }], regra.sentido)}</select></div>
      <div class="field"><label for="rConta">Conta de destino</label><select id="rConta">${opcoes(d.contas.map(c => ({ v: c.id, t: c.nome })), regra.conta)}</select></div>
      <div class="field"><label for="rPrio">Prioridade (maior primeiro)</label><input id="rPrio" type="number" inputmode="numeric" value="${regra.prioridade}"></div>
      <label class="check full"><input type="checkbox" id="rAtiva"${regra.ativa ? ' checked' : ''}> Regra ativa</label>

      <div class="teste full">
        <h3>Teste ao vivo</h3>
        <div class="field"><label for="tTit">Título</label><input id="tTit" value="${esc(ultima?.titulo || '')}"></div>
        <div class="field"><label for="tTxt">Texto</label><textarea id="tTxt" rows="3">${esc(ultima?.texto || '')}</textarea></div>
        <div id="resTeste" class="res-teste"></div>
        <div id="resRegistro" class="note"></div>
      </div>

      <div class="row full"><button class="btn primary" type="submit">Salvar</button>
        ${nova ? '' : '<button type="button" class="btn" id="btnDup">Duplicar</button><button type="button" class="btn danger" id="btnDel">Excluir</button>'}</div>
    </form>
  </div>`;

  const v = (s: string) => ($(s) as HTMLInputElement).value;
  const ler = (): RegraNotif => ({
    ...regra, nome: v('#rNome').trim(), pacote: v('#rApp'), padrao: v('#rPadrao'), descricao: v('#rDesc').trim(),
    acao: v('#rAcao') as AcaoRegra, sentido: v('#rSentido') as 'sai' | 'entra', conta: v('#rConta'),
    prioridade: Number(v('#rPrio')) || 0, ativa: ($('#rAtiva') as HTMLInputElement).checked,
  });
  const testar = () => {
    const rg = ler();
    const res = aplicarRegra(rg, { pacote: rg.pacote, titulo: v('#tTit'), texto: v('#tTxt'), quando: Date.now() });
    const box = $('#resTeste');
    if (!res) box.innerHTML = '<span class="warn">Não casou com este texto.</span>';
    else if (res.status === 'erro') box.innerHTML = `<span class="err">${esc(res.erro)}</span>`;
    else {
      const grupos = Object.entries(res.grupos).map(([k, g]) => `<code>${esc(k)}</code> = “${esc(g)}”`).join('<br>');
      box.innerHTML = res.status === 'ignorada' ? `<span class="ok">Casou: a notificação seria ignorada.</span>${grupos ? '<br>' + grupos : ''}`
        : `<span class="ok">Casou!</span><div class="kv"><div><span>Data</span>${fmtD(res.tx.data)}</div><div><span>Valor</span>${sinal(res.tx.valor)}</div>
          <div><span>Descrição</span>${esc(res.tx.desc)}</div><div><span>Conta</span>${esc(nomeConta(res.tx.conta))}</div><div><span>Tipo</span>${ACOES[res.tx.tipo]}</div></div>
          <div class="note">${grupos}</div>`;
    }
    // Contra o registro: quantas notificações deste app esta regra pegaria.
    const doApp = d.notifs.filter(n => n.pacote === rg.pacote);
    if (doApp.length) {
      const casam = doApp.filter(n => { const x = aplicarRegra(rg, n); return x && x.status !== 'erro'; }).length;
      const semRegra = doApp.filter(n => (n.status === 'sem-regra' || n.status === 'erro') && (() => { const x = aplicarRegra(rg, n); return x && x.status !== 'erro'; })()).length;
      $('#resRegistro').textContent = `Casaria com ${casam} de ${doApp.length} notificações registradas deste app${semRegra ? ` (${semRegra} hoje sem regra)` : ''}.`;
    } else $('#resRegistro').textContent = '';
  };
  for (const s of ['#rPadrao', '#rDesc', '#tTit', '#tTxt']) $(s).addEventListener('input', testar);
  for (const s of ['#rAcao', '#rSentido', '#rConta', '#rApp']) $(s).addEventListener('change', testar);
  $('#rAcao').addEventListener('change', () => { ($('#rSentido') as HTMLSelectElement).value = sentidoPadrao(v('#rAcao') as AcaoRegra); testar(); });
  testar();

  $('#fRegra').onsubmit = async e => {
    e.preventDefault();
    const rg = ler();
    try { new RegExp(rg.padrao, 'i'); } catch (err) { toast('Expressão inválida: ' + (err as Error).message); return; }
    if (rg.acao !== 'ignorar' && !/\(\?<valor>/.test(rg.padrao)) { toast('Falta o grupo (?<valor>…) no padrão.'); return; }
    await mudar(dd => ({ ...dd, regras: dd.regras.some(x => x.id === rg.id) ? dd.regras.map(x => (x.id === rg.id ? rg : x)) : [...dd.regras, rg] }));
    if (!state.dados.apps.some(a => a.pacote === rg.pacote)) {
      await mudar(dd => ({ ...dd, apps: [...dd.apps, { pacote: rg.pacote, nome: rg.pacote, ativo: true }] }));
      await enviarPacotes();
    }
    const pend = state.dados.notifs.filter(n => n.pacote === rg.pacote && (n.status === 'sem-regra' || n.status === 'erro')).length;
    toast(pend ? `Regra salva. ${pend} notificações deste app estão sem regra: reprocesse em Notificações.` : 'Regra salva.');
    if (notif) trocar(`notif/${encodeURIComponent(notif.id)}`); else voltar();
  };
  $('#btnDup')?.addEventListener('click', async () => {
    const copia = { ...ler(), id: uid('rn'), nome: ler().nome + ' (cópia)' };
    await mudar(dd => ({ ...dd, regras: [...dd.regras, copia] }));
    trocar(`regra/${copia.id}`);
  });
  $('#btnDel')?.addEventListener('click', async () => {
    if (!confirm('Excluir esta regra? As transações já criadas por ela continuam.')) return;
    await mudar(dd => ({ ...dd, regras: dd.regras.filter(x => x.id !== regra.id) }));
    voltar();
  });
}
