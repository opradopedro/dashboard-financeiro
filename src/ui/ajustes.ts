// Ajustes: estado do serviço, apps monitorados, contas, categorias, regras de categoria,
// backup/restauração/exportação e a tela de boas-vindas (permissões).
import { atualizarEstado, enviarPacotes, mudar, state } from '../app';
import { lerBackup, montarBackup } from '../core/backup';
import { exportarFinai } from '../core/finai';
import { dadosIniciais } from '../core/padroes';
import { MODOS_AVISOS, type Conta, type ModoAvisos, type TipoConta } from '../core/tipos';
import { arred, hoje, norm, parseValor, slug } from '../core/util';
import { nativo, type EstadoNativo } from '../nativo/notificacoes';
import { $, esc, opcoes, toast } from './fmt';
import { confirmar } from './escolher';
import { aba, voltar } from './nav';

const ok = (b: boolean, sim: string, nao: string) => `<span class="${b ? 'ok' : 'err'}">${b ? '✓ ' + sim : '✗ ' + nao}</span>`;

function painelServico(n: EstadoNativo | null) {
  if (!n || n.web) return `<section class="caixa"><h2>Captura de notificações</h2><p class="sub">Rodando no navegador: a captura só funciona no app instalado no Android. O simulador funciona aqui também.</p></section>`;
  return `<section class="caixa">
    <h2>Captura de notificações</h2>
    <div class="status-lista">
      <div>${ok(n.acessoPermitido, 'Acesso a notificações liberado', 'Acesso a notificações desligado')}</div>
      <div>${n.acessoPermitido ? ok(n.servicoConectado, 'Serviço ativo', 'Serviço parado (toque em Religar)') : ''}</div>
      <div>${ok(n.bateriaLiberada, 'Sem restrição de bateria', 'Bateria restringindo o app')}</div>
      <div>${ok(n.avisosPermitidos, 'Avisos do app liberados', 'Avisos do app bloqueados (sem Ignorar/Adicionar)')}</div>
      <div class="sub">Monitorando ${n.pacotes.length === 1 ? '1 app' : `${n.pacotes.length} apps`}${n.pendentes ? `, ${n.pendentes} esperando na fila` : ''}.</div>
    </div>
    <div class="row">
      ${n.acessoPermitido ? '' : '<button type="button" class="btn primary small" data-ir="boasvindas">Liberar acesso</button>'}
      ${n.bateriaLiberada ? '' : '<button type="button" class="btn small" id="btnBat">Liberar bateria</button>'}
      ${n.avisosPermitidos ? '' : '<button type="button" class="btn small" id="btnAvisos">Liberar avisos</button>'}
      ${n.acessoPermitido && !n.servicoConectado ? '<button type="button" class="btn small" id="btnReligar">Religar</button>' : ''}
      <button type="button" class="btn small" id="btnAtualizar">Verificar de novo</button>
    </div>
  </section>`;
}

function painelAvisos() {
  const c = state.dados.config;
  return `<section class="caixa">
    <h2>Avisos</h2>
    <p class="sub">Quando chega uma notificação de app monitorado, o app pode avisar com os botões Ignorar e Adicionar, sem precisar abri-lo. Adicionar cria a regra e a transação; Ignorar silencia as próximas com o mesmo título.</p>
    <div class="field"><label for="modoAvisos">Avisar</label><select id="modoAvisos">${opcoes((Object.keys(MODOS_AVISOS) as ModoAvisos[]).map(m => ({ v: m, t: MODOS_AVISOS[m] })), c.avisos)}</select></div>
  </section>
  <section class="caixa">
    <h2>Seu nome</h2>
    <p class="sub">Como aparece nos bancos. Pix de você para você mesmo (de outra conta sua) passa a contar como transferência interna, não como entrada.</p>
    <form id="fTitular" class="form" autocomplete="off"><div class="field full"><label for="titular">Nome completo</label><input id="titular" value="${esc(c.titular)}" autocapitalize="words"></div>
      <div class="row full"><button class="btn small" type="submit">Salvar nome</button></div></form>
  </section>`;
}

export function telaAjustes(el: HTMLElement) {
  const d = state.dados;
  el.innerHTML = `${painelServico(state.nativo)}
  <div class="folha"><div class="list">
    ${[['apps', 'Apps monitorados', `${d.apps.filter(a => a.ativo).length} ativos`], ['regras', 'Regras', `${d.regras.length} de notificação, ${d.regrasCat.length} de categoria`],
       ['contas', 'Contas', `${d.contas.length} contas`], ['categorias', 'Categorias e palavras-chave', `${d.categorias.length} categorias`],
       ['filtros', 'Filtros salvos', `${d.filtros.length === 1 ? '1 filtro' : `${d.filtros.length} filtros`} do Painel`],
       ['dados', 'Backup, restauração e exportação', 'Arquivo do app e finai-banco/1'],
       ['boasvindas', 'Guia de permissões', 'Notificações, avisos e bateria'],
       ['novidades', 'Novidades', `O que mudou em cada versão`]]
      .map(([r, t, s]) => `<button type="button" class="item" data-ir="${r}"><div class="name">${t}</div><div class="val"></div><div class="meta">${s}</div><div class="meta r"></div></button>`).join('')}
  </div></div>
  ${painelAvisos()}
  <p class="note">Dashboard Financeiro ${esc(__VERSAO__)}. Seus dados ficam só neste aparelho; o app não usa a internet nem tem permissão para isso.</p>`;
  ligarServico();
  $('#modoAvisos').onchange = async () => {
    const avisos = ($('#modoAvisos') as HTMLSelectElement).value as ModoAvisos;
    await mudar(dd => ({ ...dd, config: { ...dd.config, avisos } }));
    toast('Avisos: ' + MODOS_AVISOS[avisos].toLowerCase() + '.');
  };
  $('#fTitular').onsubmit = async e => {
    e.preventDefault();
    const titular = ($('#titular') as HTMLInputElement).value.trim();
    await mudar(dd => ({ ...dd, config: { ...dd.config, titular } }));
    toast(titular ? 'Nome salvo.' : 'Nome apagado.');
  };
}

async function liberarAvisos() {
  try {
    const { permitido } = await nativo.pedirPermissaoAvisos();
    if (!permitido) await nativo.abrirConfigAvisos();
  } catch (e) { toast((e as Error).message); }
  await atualizarEstado();
  dispatchEvent(new Event('rerender'));
}

function ligarServico() {
  $('#btnAvisos')?.addEventListener('click', liberarAvisos);
  $('#btnBat')?.addEventListener('click', () => nativo.pedirBateria().catch(e => toast((e as Error).message)));
  $('#btnReligar')?.addEventListener('click', async () => { await nativo.religar(); setTimeout(async () => { await atualizarEstado(); dispatchEvent(new Event('rerender')); }, 1500); });
  $('#btnAtualizar')?.addEventListener('click', async () => { await atualizarEstado(); dispatchEvent(new Event('rerender')); });
}

// ---------- Boas-vindas / permissões ----------

export function telaBoasVindas(el: HTMLElement) {
  const n = state.nativo;
  const restrito = !n || n.android >= 33 || n.web;
  el.innerHTML = `<section class="fita">
    <div class="fita-mes"><h2>olá</h2></div>
    <p class="frase">Este app lê as notificações dos seus apps de banco e transforma em transações. Tudo fica só no aparelho; ele nem tem acesso à internet.</p>
  </section>
  <section class="caixa">
    <h2>1. Acesso a notificações</h2>
    <div>${n?.web ? '<span class="sub">No navegador não há o que liberar.</span>' : ok(!!n?.acessoPermitido, 'Liberado', 'Ainda não liberado')}</div>
    <ol class="passos">
      <li>Toque em <b>Abrir configuração</b> e ative <b>Dashboard Financeiro</b> (às vezes em “Apps” ou “Acesso a notificações”). Confirme no aviso do Android.</li>
      ${restrito ? `<li><b>Se a opção estiver cinza ou aparecer “Configuração restrita”</b> (Android 13 ou mais novo, em apps instalados por APK):
        <ol type="a">
          <li>Toque em <b>Abrir informações do app</b>.</li>
          <li>Toque nos <b>três pontinhos ⋮</b> no canto de cima e em <b>Permitir configurações restritas</b> (confirme com a senha/digital). Se não aparecer o ⋮, tente primeiro ativar o acesso uma vez (o Android só libera o menu depois de bloquear).</li>
          <li>Volte e toque de novo em <b>Abrir configuração</b>: agora dá para ativar.</li>
        </ol></li>` : ''}
    </ol>
    <div class="row"><button type="button" class="btn primary" id="bvAcesso">Abrir configuração</button>
      ${restrito ? '<button type="button" class="btn" id="bvInfo">Abrir informações do app</button>' : ''}</div>
  </section>
  <section class="caixa">
    <h2>2. Avisos do app</h2>
    <div>${n?.web ? '' : ok(!!n?.avisosPermitidos, 'Liberados', 'Ainda não liberados')}</div>
    <p class="sub">Para o app perguntar, com os botões Ignorar e Adicionar, o que fazer com cada notificação que ainda não tem regra.</p>
    <div class="row"><button type="button" class="btn primary" id="bvAvisos">Permitir avisos</button></div>
  </section>
  <section class="caixa">
    <h2>3. Bateria</h2>
    <div>${n?.web ? '' : ok(!!n?.bateriaLiberada, 'Sem restrição', 'O Android pode parar o serviço para economizar bateria')}</div>
    <div class="sub">Toque em <b>Liberar bateria</b> e escolha <b>Permitir</b>. Em alguns aparelhos (Xiaomi, Samsung, Motorola) também vale abrir as informações do app → Bateria → <b>Sem restrições</b>, e manter o app “travado” na tela de recentes.</div>
    <div class="row"><button type="button" class="btn primary" id="bvBat">Liberar bateria</button></div>
  </section>
  <section class="caixa">
    <h2>4. Pronto</h2>
    <div class="sub">A partir daqui, toda notificação dos apps monitorados é guardada mesmo com o app fechado, e entra quando você abrir. Teste com <b>Notificações → Simular notificação</b>. As regras que vieram com o app são um chute: ajuste com as notificações reais.</div>
    <div class="row"><button type="button" class="btn primary" id="bvFim">Começar</button><button type="button" class="btn" id="bvAtualizar">Verificar de novo</button></div>
  </section>`;
  $('#bvAvisos').onclick = liberarAvisos;
  $('#bvAcesso').onclick = () => nativo.abrirAcessoNotificacoes().catch(e => toast((e as Error).message));
  $('#bvInfo')?.addEventListener('click', () => nativo.abrirInfoApp().catch(e => toast((e as Error).message)));
  $('#bvBat').onclick = () => nativo.pedirBateria().catch(e => toast((e as Error).message));
  $('#bvAtualizar').onclick = async () => { await atualizarEstado(); dispatchEvent(new Event('rerender')); };
  $('#bvFim').onclick = async () => {
    if (!state.dados.config.boasVindasVista) await mudar(dd => ({ ...dd, config: { ...dd.config, boasVindasVista: true } }));
    aba('');
  };
}

// ---------- Apps monitorados ----------

export function telaApps(el: HTMLElement) {
  const d = state.dados;
  const qtd = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
  el.innerHTML = `<p class="sub">Só as notificações destes apps são lidas; as de qualquer outro app são descartadas sem gravar nada. O nome do pacote está no link do app na Play Store, depois de <code>id=</code>.</p>
  <div class="folha"><div class="list">${d.apps.map((a, i) => `<div class="item">
      <div class="name">${esc(a.nome)}</div>
      <div class="val"><label class="switch"><input type="checkbox" data-ativo="${i}"${a.ativo ? ' checked' : ''}> ativo</label></div>
      <div class="meta"><code>${esc(a.pacote)}</code><br>${qtd(d.notifs.filter(n => n.pacote === a.pacote).length, 'notificação', 'notificações')}, ${qtd(d.regras.filter(r => r.pacote === a.pacote).length, 'regra', 'regras')}</div>
      <div class="meta r"><button type="button" class="btn small danger" data-del="${i}">Remover</button></div>
      <div class="field full" style="grid-column:1/-1;margin-top:6px"><label for="conta${i}">Conta usada pelo botão Adicionar</label>
        <select id="conta${i}" data-conta="${i}"><option value="">Escolher pelo nome do banco</option>${opcoes(d.contas.map(c => ({ v: c.id, t: c.nome })), a.conta || '')}</select></div></div>`).join('') || '<div class="empty">Nenhum app.</div>'}</div></div>
  <section class="caixa"><h2>Adicionar app</h2>
    <form id="fApp" class="form" autocomplete="off">
      <div class="field"><label for="aNome">Nome</label><input id="aNome" placeholder="Inter" required></div>
      <div class="field"><label for="aPac">Pacote</label><input id="aPac" placeholder="br.com.intermedium" spellcheck="false" autocapitalize="off" required></div>
      <div class="row full"><button class="btn primary" type="submit">Adicionar app</button></div>
    </form></section>`;
  const salvar = async (f: (a: typeof d.apps) => typeof d.apps) => { await mudar(dd => ({ ...dd, apps: f(dd.apps) })); await atualizarEstado(); dispatchEvent(new Event('rerender')); };
  el.querySelectorAll<HTMLInputElement>('[data-ativo]').forEach(x => (x.onchange = () => salvar(apps => apps.map((a, i) => (i === +x.dataset.ativo! ? { ...a, ativo: x.checked } : a)))));
  el.querySelectorAll<HTMLSelectElement>('[data-conta]').forEach(x => (x.onchange = () => salvar(apps => apps.map((a, i) => (i === +x.dataset.conta! ? { ...a, conta: x.value || undefined } : a)))));
  el.querySelectorAll<HTMLButtonElement>('[data-del]').forEach(x => (x.onclick = () => {
    if (confirm('Remover este app da lista? As notificações e regras dele continuam guardadas.')) void salvar(apps => apps.filter((_, i) => i !== +x.dataset.del!));
  }));
  $('#fApp').onsubmit = e => {
    e.preventDefault();
    const pacote = ($('#aPac') as HTMLInputElement).value.trim(), nome = ($('#aNome') as HTMLInputElement).value.trim();
    if (!/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(pacote)) { toast('Pacote inválido (ex.: br.com.banco.app).'); return; }
    if (d.apps.some(a => a.pacote === pacote)) { toast('Esse app já está na lista.'); return; }
    void salvar(apps => [...apps, { pacote, nome, ativo: true }]);
  };
}

// ---------- Contas ----------

export function telaContas(el: HTMLElement) {
  const d = state.dados;
  el.innerHTML = `<div class="folha"><div class="list">${d.contas.map(c => `<button type="button" class="item${c.ativa ? '' : ' fora'}" data-ir="conta/${esc(c.id)}">
    <div class="name">${esc(c.nome)}</div><div class="val"></div>
    <div class="meta">${c.tipo === 'cartao' ? 'Cartão de crédito' : 'Conta'} do ${esc(c.banco)}, ${d.txs.filter(t => t.conta === c.id).length} transações</div><div class="meta r">${c.ativa ? '' : 'desativada'}</div></button>`).join('')}</div></div>
    <div class="row"><button type="button" class="btn primary" data-ir="conta/nova">Nova conta</button></div>`;
}

export function telaConta(el: HTMLElement, id: string) {
  const d = state.dados;
  const c: Conta = d.contas.find(x => x.id === id) || { id: '', nome: '', banco: '', tipo: 'corrente', ativa: true };
  const nova = !c.id;
  const n = d.txs.filter(t => t.conta === c.id).length;
  el.innerHTML = `<div class="panel"><form id="fConta" class="form" autocomplete="off">
    <div class="field full"><label for="cNome">Nome</label><input id="cNome" value="${esc(c.nome)}" placeholder="Inter conta" required></div>
    <div class="field"><label for="cBanco">Banco</label><input id="cBanco" value="${esc(c.banco)}" placeholder="Inter" required></div>
    <div class="field"><label for="cTipo">Tipo</label><select id="cTipo">${opcoes([{ v: 'corrente', t: 'Conta (corrente/pagamento)' }, { v: 'cartao', t: 'Cartão de crédito' }], c.tipo)}</select></div>
    <div class="field"><label for="cSaldo">Saldo informado (opcional)</label><input id="cSaldo" inputmode="decimal" value="${c.saldoRef ? esc(String(c.saldoRef.valor).replace('.', ',')) : ''}" placeholder="${c.tipo === 'cartao' ? 'fatura em aberto, negativo' : '0,00'}"></div>
    <div class="field"><label for="cSaldoData">Na data</label><input id="cSaldoData" type="date" value="${esc(c.saldoRef?.data || hoje())}"></div>
    <div class="note full">O saldo estimado é este valor mais as transações depois da data. No cartão, informe a fatura em aberto como negativo (ex.: -350,00). Vai na exportação finai-banco/1.</div>
    <label class="check full"><input type="checkbox" id="cAtiva"${c.ativa ? ' checked' : ''}> Ativa (aparece no painel e nas listas)</label>
    ${nova ? '' : `<div class="note full">Identificador: <code>${esc(c.id)}</code> (usado no backup e na exportação).</div>`}
    <div class="row full"><button class="btn primary" type="submit">Salvar</button>${nova ? '' : `<button type="button" class="btn danger" id="btnDelConta">Excluir</button>`}</div>
  </form></div>`;
  $('#fConta').onsubmit = async e => {
    e.preventDefault();
    const v = (s: string) => ($(s) as HTMLInputElement).value.trim();
    const saldo = v('#cSaldo') ? parseValor(v('#cSaldo')) : NaN;
    if (v('#cSaldo') && !Number.isFinite(saldo)) { toast('Saldo inválido.'); return; }
    const igual = d.contas.find(x => x.id !== c.id && norm(x.nome).trim() === norm(v('#cNome')).trim());
    if (igual && !(await confirmar('Conta repetida', `Já existe uma conta exatamente como essa: ${igual.nome} (${igual.tipo === 'cartao' ? 'cartão' : 'conta'} ${igual.banco})${igual.ativa ? '' : ', desativada'}. Deseja continuar?`, { sim: 'Salvar mesmo assim' }))) return;
    let novoId = c.id;
    if (nova) { const base = slug(`${v('#cBanco')}-${v('#cTipo') === 'cartao' ? 'cartao' : 'conta'}`); novoId = base; let i = 2; while (d.contas.some(x => x.id === novoId)) novoId = `${base}-${i++}`; }
    const conta: Conta = { id: novoId, nome: v('#cNome'), banco: v('#cBanco'), tipo: v('#cTipo') as TipoConta, ativa: ($('#cAtiva') as HTMLInputElement).checked,
      ...(Number.isFinite(saldo) ? { saldoRef: { valor: arred(saldo), data: v('#cSaldoData') || hoje() } } : {}) };
    await mudar(dd => ({ ...dd, contas: nova ? [...dd.contas, conta] : dd.contas.map(x => (x.id === c.id ? conta : x)) }));
    toast('Conta salva.');
    voltar();
  };
  $('#btnDelConta')?.addEventListener('click', async () => {
    if (n) { toast(`Esta conta tem ${n} transações. Desative em vez de excluir (ou exclua as transações antes).`); return; }
    if (d.regras.some(r => r.conta === c.id)) { toast('Há regras de notificação usando esta conta. Mude a conta delas antes.'); return; }
    if (!confirm(`Excluir a conta ${c.nome}?`)) return;
    await mudar(dd => ({ ...dd, contas: dd.contas.filter(x => x.id !== c.id), modelos: dd.modelos.filter(m => m.conta !== c.id) }));
    voltar();
  });
}

// ---------- Categorias ----------

export function telaCategorias(el: HTMLElement) {
  const d = state.dados;
  const linha = (i: number) => {
    const c = d.categorias[i];
    return `<div class="cat-ed" data-i="${i}">
      <div class="row between"><b>${esc(c.nome)}</b><span class="sub">${c.receita ? 'entrada' : 'gasto'}</span></div>
      <textarea rows="2" data-palavras="${i}" spellcheck="false" autocapitalize="off" placeholder="palavras separadas por vírgula">${esc(c.palavras.join(', '))}</textarea>
      <div class="row"><button type="button" class="btn small" data-ren="${i}">Renomear</button><button type="button" class="btn small danger" data-delcat="${i}">Excluir</button></div></div>`;
  };
  el.innerHTML = `<div class="panel">
    <div class="sub">A descrição de cada transação é comparada com as palavras de cada categoria (sem acento, maiúsculas tanto faz). Vence o trecho mais longo encontrado. Use <code>*</code> no fim para “começa com” (ex.: <code>combustiv*</code>). Entradas só caem em categorias de entrada.</div>
    <div class="row"><button type="button" class="btn primary small" id="btnSalvarCats">Salvar palavras</button></div>
  </div>
  <div class="panel"><h2>Gastos</h2>${d.categorias.map((c, i) => (c.receita ? '' : linha(i))).join('')}</div>
  <div class="panel"><h2>Entradas</h2>${d.categorias.map((c, i) => (c.receita ? linha(i) : '')).join('')}</div>
  <div class="panel"><h2>Nova categoria</h2><form id="fCat" class="form">
    <div class="field"><label for="ncNome">Nome</label><input id="ncNome" required></div>
    <div class="field"><label for="ncTipo">Tipo</label><select id="ncTipo"><option value="g">Gasto</option><option value="r">Entrada</option></select></div>
    <div class="row full"><button class="btn primary" type="submit">Criar</button></div></form></div>`;
  const lerPalavras = () => d.categorias.map((c, i) => ({ ...c, palavras: (el.querySelector<HTMLTextAreaElement>(`[data-palavras="${i}"]`)!.value).split(',').map(s => s.trim().toLowerCase()).filter(Boolean) }));
  $('#btnSalvarCats').onclick = async () => { await mudar(dd => ({ ...dd, categorias: lerPalavras() })); toast('Palavras salvas.'); };
  el.querySelectorAll<HTMLButtonElement>('[data-ren]').forEach(b => (b.onclick = async () => {
    const c = d.categorias[+b.dataset.ren!];
    const novo = prompt('Novo nome da categoria', c.nome)?.trim();
    if (!novo || novo === c.nome) return;
    if (d.categorias.some(x => x.nome === novo)) { toast('Já existe uma categoria com esse nome.'); return; }
    const cats = lerPalavras();
    await mudar(dd => ({ ...dd, categorias: cats.map(x => (x.nome === c.nome ? { ...x, nome: novo } : x)),
      txs: dd.txs.map(t => (t.cat === c.nome ? { ...t, cat: novo } : t)), regrasCat: dd.regrasCat.map(r => (r.cat === c.nome ? { ...r, cat: novo } : r)) }));
    dispatchEvent(new Event('rerender'));
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-delcat]').forEach(b => (b.onclick = async () => {
    const c = d.categorias[+b.dataset.delcat!];
    if (!confirm(`Excluir a categoria ${c.nome}? Transações marcadas com ela ficam sem categoria.`)) return;
    const cats = lerPalavras().filter(x => x.nome !== c.nome);
    await mudar(dd => ({ ...dd, categorias: cats, txs: dd.txs.map(t => (t.cat === c.nome ? (({ cat: _c, ...r }) => r)(t) : t)), regrasCat: dd.regrasCat.filter(r => r.cat !== c.nome) }));
    dispatchEvent(new Event('rerender'));
  }));
  $('#fCat').onsubmit = async e => {
    e.preventDefault();
    const nome = ($('#ncNome') as HTMLInputElement).value.trim();
    if (!nome) { toast('Escreva o nome.'); return; }
    const igual = d.categorias.find(x => norm(x.nome).trim() === norm(nome).trim());
    if (igual) { toast(`Já existe a categoria “${igual.nome}”.`); return; }
    const cats = lerPalavras();
    await mudar(dd => ({ ...dd, categorias: [...cats, { nome, receita: ($('#ncTipo') as HTMLSelectElement).value === 'r', palavras: [] }] }));
    dispatchEvent(new Event('rerender'));
  };
}

// ---------- Dados ----------

const dataArq = () => hoje();

export function telaDados(el: HTMLElement) {
  const d = state.dados;
  el.innerHTML = `<div class="panel">
    <h2>Backup</h2>
    <div class="sub">Salva tudo (transações, notificações, regras, contas, categorias, modelos) num arquivo .json. Guarde fora do celular (Drive, e-mail). Hoje: ${d.txs.length} transações e ${d.notifs.length} notificações.</div>
    <div class="row"><button type="button" class="btn primary" id="btnBackup">Salvar backup</button></div>
  </div>
  <div class="panel">
    <h2>Restaurar</h2>
    <div class="sub">Substitui <b>todos</b> os dados deste aparelho pelos do arquivo.</div>
    <div class="row"><label class="btn" for="fRest">Escolher backup<input type="file" id="fRest" accept=".json,application/json"></label></div>
  </div>
  <div class="panel">
    <h2>Exportar finai-banco/1</h2>
    <div class="sub">Contas e transações no formato finai-banco/1 (o mesmo do carteira). Período opcional.</div>
    <div class="form">
      <div class="field"><label for="eDe">De</label><input id="eDe" type="date"></div>
      <div class="field"><label for="eAte">Até</label><input id="eAte" type="date"></div>
    </div>
    <div class="row"><button type="button" class="btn primary" id="btnFinai">Exportar</button></div>
  </div>
  <div class="panel">
    <h2>Apagar tudo</h2>
    <div class="sub">Volta o app ao estado de instalação (contas, apps, regras e categorias iniciais). Faça um backup antes.</div>
    <div class="row"><button type="button" class="btn danger" id="btnApagar">Apagar todos os dados</button></div>
  </div>`;
  const salvar = async (nome: string, conteudo: string) => {
    try {
      const r = await nativo.salvarArquivo({ nome, mime: 'application/json', conteudo });
      toast(r.salvo ? 'Arquivo salvo.' : 'Cancelado.');
    } catch (e) { toast('Não consegui salvar: ' + (e as Error).message); }
  };
  $('#btnBackup').onclick = () => salvar(`dashboard-financeiro-backup-${dataArq()}.json`, JSON.stringify(montarBackup(state.dados)));
  $('#btnFinai').onclick = () => {
    const de = ($('#eDe') as HTMLInputElement).value, ate = ($('#eAte') as HTMLInputElement).value;
    const arq = exportarFinai(state.dados.contas, state.dados.txs, { de: de || undefined, ate: ate || undefined });
    void salvar(`finai-banco-${dataArq()}.json`, JSON.stringify(arq, null, 2));
  };
  ($('#fRest') as HTMLInputElement).onchange = async e => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    try {
      const novo = lerBackup(await f.text());
      if (!confirm(`Restaurar ${f.name}?\n\n${novo.txs.length} transações, ${novo.notifs.length} notificações, ${novo.regras.length} regras, ${novo.contas.length} contas.\n\nOs dados atuais deste aparelho serão substituídos.`)) return;
      await mudar(() => ({ ...novo, config: { ...novo.config, boasVindasVista: true } }));
      await enviarPacotes();
      toast('Backup restaurado.');
      aba('');
    } catch (err) { toast((err as Error).message); }
  };
  $('#btnApagar').onclick = async () => {
    if (!confirm('Apagar TODOS os dados deste aparelho? Não dá para desfazer.')) return;
    if (prompt('Para confirmar, digite APAGAR') !== 'APAGAR') return;
    await mudar(() => { const ini = dadosIniciais(); return { ...ini, config: { ...ini.config, boasVindasVista: true } }; });
    await enviarPacotes();
    toast('Dados apagados.');
    aba('');
  };
}

