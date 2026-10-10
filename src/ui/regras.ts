// Regras de notificação: lista por app e editor com teste ao vivo contra um texto e contra as
// notificações já registradas.
import { enviarPacotes, mudar, nomeApp, nomeConta, state } from '../app';
import { aplicarRegra, sentidoPadrao, sugerirPadrao } from '../core/regras';
import { ACOES, ORIGENS_REGRA, TIPOS, type AcaoRegra, type OrigemRegra, type RegraNotif, type TipoTx } from '../core/tipos';
import { norm, uid } from '../core/util';
import { $, esc, fmtD, opcoes, sinal, toast } from './fmt';
import { campoCategoria, confirmar, ligarCampoCategoria, valorCampo } from './escolher';
import { trocar, voltar, type Rota } from './nav';

const ORDENS: [string, string][] = [['app', 'Por app'], ['recentes', 'Mais recentes'], ['antigas', 'Mais antigas']];

export function telaRegras(el: HTMLElement, r: Rota) {
  const d = state.dados;
  const ordem = r.query.get('ordem') || 'app';
  const origem = (r.query.get('origem') || '') as OrigemRegra | '';
  const tipo = r.query.get('tipo') || 'notif';
  const q = (o: Record<string, string>) => { const p = new URLSearchParams({ ordem, origem, tipo, ...o }); for (const [k, v] of [...p]) if (!v) p.delete(k); return p.toString() ? '?' + p : ''; };
  const contagem = (o: OrigemRegra) => d.regras.filter(x => x.origem === o).length;
  const linha = (x: RegraNotif) => `<button type="button" class="item${x.ativa ? '' : ' fora'}" data-ir="regra/${esc(x.id)}">
      <div class="name">${esc(x.nome)}</div><div class="val"><span class="tag ${x.acao === 'ignorar' ? 'muted' : ''}">${ACOES[x.acao].replace(' (não vira transação)', '')}</span></div>
      <div class="meta">${ordem === 'app' ? '' : `${esc(nomeApp(x.pacote))}, `}${ORIGENS_REGRA[x.origem].toLowerCase()}${x.criadaEm ? ` em ${fmtD(x.criadaEm.slice(0, 10))}` : ''}${x.ativa ? '' : ', desativada'}</div>
      <div class="meta r">prioridade ${x.prioridade}</div></button>`;
  let corpo: string;
  if (tipo === 'cat') {
    corpo = `<p class="sub">Tudo que contém o trecho na descrição (do extrato ou da notificação) recebe o tipo e a categoria. Valem antes da classificação automática. Exemplo: “itau unibanco”, Entrada, Salário.</p>
      <section class="caixa"><h3>Nova regra de categoria</h3>
        <form id="fRegraCat" class="form" autocomplete="off">
          <div class="field full"><label for="rcTermo">A descrição contém</label><input id="rcTermo" placeholder="itau unibanco" autocapitalize="off" spellcheck="false" required></div>
          <div class="field"><label for="rcTipo">Tipo</label><select id="rcTipo"><option value="">Não mudar</option>${opcoes(Object.entries(TIPOS).map(([v, t]) => ({ v, t })))}</select></div>
          <div class="field"><label for="rcCat">Categoria</label>${campoCategoria('rcCat', '', 'Não mudar')}</div>
          <div class="row full"><button class="btn primary" type="submit">Criar regra</button></div>
        </form></section>
      <div class="folha"><div class="list">${d.regrasCat.map(x => `<div class="item"><div class="name">“${esc(x.termo)}”</div>
      <div class="val"><button type="button" class="btn small danger" data-delcat="${esc(x.id)}">Excluir</button></div>
      <div class="meta">${[x.tipo ? TIPOS[x.tipo] : '', x.cat || ''].filter(Boolean).join(', ')}</div><div class="meta r"></div></div>`).join('') || '<div class="empty">Nenhuma regra de categoria ainda.</div>'}</div></div>`;
  } else {
    const filtradas = d.regras.map((x, i) => ({ x, i })).filter(({ x }) => !origem || x.origem === origem);
    if (ordem === 'app') {
      const pacotes = [...new Set([...d.apps.map(a => a.pacote), ...d.regras.map(x => x.pacote)])];
      corpo = pacotes.map(p => {
        const rs = filtradas.filter(({ x }) => x.pacote === p).sort((a, b) => b.x.prioridade - a.x.prioridade || a.i - b.i).map(({ x }) => x);
        return rs.length ? `<section class="panel"><h2>${esc(nomeApp(p))}</h2><div class="folha"><div class="list">${rs.map(linha).join('')}</div></div></section>` : '';
      }).join('') || '<div class="empty">Nenhuma regra com este filtro.</div>';
    } else {
      // Ordem de criação: as que vieram com o app (sem data) contam como as mais antigas, na ordem da lista.
      const chave = (o: { x: RegraNotif; i: number }) => (o.x.criadaEm || '') + String(o.i).padStart(5, '0');
      const ord = filtradas.sort((a, b) => chave(a).localeCompare(chave(b)));
      if (ordem === 'recentes') ord.reverse();
      corpo = `<div class="folha"><div class="list">${ord.map(({ x }) => linha(x)).join('') || '<div class="empty">Nenhuma regra com este filtro.</div>'}</div></div>`;
    }
  }
  el.innerHTML = `<section class="panel">
    <p class="sub">Cada regra lê o título e o texto da notificação e decide o que ela vira. Vale a de maior prioridade que casar. As que vieram com o app foram conferidas só em parte com notificações reais.</p>
    <div class="row"><button type="button" class="btn primary small" data-ir="regra/nova">Nova regra</button></div>
  </section>
  <div class="seg" role="group" aria-label="Tipo de regra">
    <button type="button" data-q="${q({ tipo: 'notif' })}" aria-pressed="${tipo !== 'cat'}">De notificação (${d.regras.length})</button>
    <button type="button" data-q="${q({ tipo: 'cat', origem: '' })}" aria-pressed="${tipo === 'cat'}">De categoria (${d.regrasCat.length})</button>
  </div>
  ${tipo === 'cat' ? '' : `<div class="seg" role="group" aria-label="Ordenar">${ORDENS.map(([v, t]) => `<button type="button" data-q="${q({ ordem: v })}" aria-pressed="${v === ordem}">${t}</button>`).join('')}</div>
  <div class="seg" role="group" aria-label="Origem"><button type="button" data-q="${q({ origem: '' })}" aria-pressed="${!origem}">Todas as origens</button>${(Object.keys(ORIGENS_REGRA) as OrigemRegra[]).map(o => `<button type="button" data-q="${q({ origem: o })}" aria-pressed="${o === origem}">${ORIGENS_REGRA[o]} (${contagem(o)})</button>`).join('')}</div>`}
  ${corpo}`;
  el.querySelectorAll<HTMLButtonElement>('[data-q]').forEach(b => (b.onclick = () => trocar('regras' + b.dataset.q)));
  ligarCampoCategoria('rcCat', { vazio: 'Não mudar', receita: () => ($('#rcTipo') as HTMLSelectElement | null)?.value === 'entrada' });
  $('#fRegraCat')?.addEventListener('submit', async e => {
    e.preventDefault();
    const termo = norm(($('#rcTermo') as HTMLInputElement).value).trim();
    const tipoSel = ($('#rcTipo') as HTMLSelectElement).value as TipoTx | '';
    const cat = valorCampo('rcCat');
    if (!termo || (!tipoSel && !cat)) { toast('Escreva o trecho e escolha o tipo ou a categoria.'); return; }
    const igual = state.dados.regrasCat.find(x => x.termo === termo);
    if (igual && !(await confirmar('Regra repetida', `Já existe uma regra para “${termo}”${igual.cat ? ` (categoria ${igual.cat})` : ''}${igual.tipo ? ` (tipo ${TIPOS[igual.tipo].toLowerCase()})` : ''}. A nova substitui a antiga. Deseja continuar?`, { sim: 'Substituir' }))) return;
    await mudar(dd => ({ ...dd, regrasCat: [...dd.regrasCat.filter(x => x.termo !== termo), { id: uid('rc'), termo, ...(tipoSel ? { tipo: tipoSel } : {}), ...(cat ? { cat } : {}) }] }));
    toast(`Regra criada para “${termo}”.`);
    dispatchEvent(new Event('rerender'));
  });
  el.querySelectorAll<HTMLButtonElement>('[data-delcat]').forEach(b => (b.onclick = async () => {
    await mudar(dd => ({ ...dd, regrasCat: dd.regrasCat.filter(x => x.id !== b.dataset.delcat) }));
    dispatchEvent(new Event('rerender'));
  }));
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
    origem: notif ? 'notificacao' : 'manual', criadaEm: new Date().toISOString(),
  };
  const pacotes = [...new Set([...d.apps.map(a => a.pacote), regra.pacote].filter(Boolean))];
  const ultima = notif || [...d.notifs].reverse().find(n => n.pacote === regra.pacote);
  el.innerHTML = `<section class="panel">
    ${existente ? `<p class="sub">${ORIGENS_REGRA[regra.origem]}${regra.criadaEm ? `, em ${fmtD(regra.criadaEm.slice(0, 10))}` : ''}.</p>` : ''}
    <form id="fRegra" class="form" autocomplete="off">
      <div class="field full"><label for="rNome">Nome</label><input id="rNome" value="${esc(regra.nome)}" required></div>
      <div class="field full"><label for="rApp">App</label><select id="rApp">${opcoes(pacotes.map(p => ({ v: p, t: nomeApp(p) })), regra.pacote)}</select></div>
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
        <h3>Teste com um texto</h3>
        <div class="field"><label for="tTit">Título</label><input id="tTit" value="${esc(ultima?.titulo || '')}"></div>
        <div class="field"><label for="tTxt">Texto</label><textarea id="tTxt" rows="3">${esc(ultima?.texto || '')}</textarea></div>
        <div id="resTeste" class="res-teste"></div>
        <div id="resRegistro" class="note"></div>
      </div>

      <div class="row full"><button class="btn primary" type="submit">Salvar regra</button>
        ${nova ? '' : '<button type="button" class="btn" id="btnDup">Duplicar</button><button type="button" class="btn danger" id="btnDel">Excluir</button>'}</div>
    </form>
  </section>`;

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
    const igual = state.dados.regras.find(x => x.id !== rg.id && x.pacote === rg.pacote && x.padrao.trim() === rg.padrao.trim());
    if (igual && !(await confirmar('Regra repetida', `Já existe uma regra exatamente como essa para este app: “${igual.nome}”${igual.ativa ? '' : ' (desligada)'}. Deseja continuar?`, { sim: 'Salvar mesmo assim' }))) return;
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
