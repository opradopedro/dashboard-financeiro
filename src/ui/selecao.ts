// Seleção de várias transações em qualquer lista (Transações, categoria, entradas/saídas…):
// toque e segure numa transação para começar; depois cada toque marca ou desmarca. A barra embaixo
// muda categoria, tipo ou conta, inverte o sinal ou exclui as marcadas de uma vez.
import { editarTxs, excluirTxs, mudar, state } from '../app';
import { TIPOS, type TipoTx } from '../core/tipos';
import { definirCategoria } from '../core/sugestoes';
import { confirmar, escolherCategoria, escolherOpcao } from './escolher';
import { toast } from './fmt';

let marcadas: Set<string> | null = null; // null = fora do modo de seleção
let ignorarClique = false;

const SELETOR = '#view .item.tx[data-ir^="tx/"]';
const idDe = (b: Element) => (b.getAttribute('data-ir') || '').slice(3);
const itens = () => Array.from(document.querySelectorAll<HTMLElement>(SELETOR));

/** Atualiza as marcas na tela e a barra de ações (chamado depois de cada redesenho). */
export function aplicarSelecao() {
  document.body.classList.toggle('selecionando', !!marcadas);
  for (const b of itens()) {
    const on = !!marcadas?.has(idDe(b));
    b.classList.toggle('marcada', on);
    if (marcadas) b.setAttribute('aria-pressed', String(on)); else b.removeAttribute('aria-pressed');
  }
  let barra = document.getElementById('barraSel');
  if (!marcadas) { barra?.remove(); return; }
  if (!barra) { barra = document.createElement('div'); barra.id = 'barraSel'; barra.className = 'barra-sel'; document.body.appendChild(barra); }
  const n = marcadas.size, visiveis = itens().map(idDe), todas = visiveis.length > 0 && visiveis.every(id => marcadas!.has(id));
  barra.innerHTML = `<div class="row between nowrap"><b>${n === 1 ? '1 marcada' : `${n} marcadas`}</b>
      <div class="row nowrap"><button type="button" class="btn small" data-sel="todas">${todas ? 'Desmarcar todas' : 'Marcar todas'}</button>
      <button type="button" class="btn small" data-sel="sair">Cancelar</button></div></div>
    <div class="sel-acoes">${[['categoria', 'Categoria'], ['tipo', 'Tipo'], ['conta', 'Conta'], ['inverter', 'Inverter sinal'], ['excluir', 'Excluir']]
      .map(([a, t]) => `<button type="button" class="btn small${a === 'excluir' ? ' danger' : ''}" data-sel="${a}"${n ? '' : ' disabled'}>${t}</button>`).join('')}</div>`;
}

const sair = () => { marcadas = null; aplicarSelecao(); };

async function acao(a: string) {
  if (!marcadas) return;
  if (a === 'sair') { sair(); return; }
  if (a === 'todas') {
    const vis = itens().map(idDe);
    if (vis.every(id => marcadas!.has(id))) vis.forEach(id => marcadas!.delete(id)); else vis.forEach(id => marcadas!.add(id));
    aplicarSelecao();
    return;
  }
  const ids = [...marcadas];
  if (!ids.length) return;
  const txs = state.dados.txs.filter(t => marcadas!.has(t.id));
  const qtd = ids.length === 1 ? '1 transação' : `${ids.length} transações`;
  if (a === 'categoria') {
    const c = await escolherCategoria('', { receita: () => txs.every(t => t.valor > 0) });
    if (c === null) return;
    await mudar(d => ({ ...d, txs: definirCategoria(d.txs, ids, c) }));
    toast(`Categoria mudada em ${qtd}.`);
  } else if (a === 'tipo') {
    const t = await escolherOpcao(`Tipo de ${qtd}`, (Object.keys(TIPOS) as TipoTx[]).map(v => ({ v, t: TIPOS[v] })));
    if (!t) return;
    await editarTxs(ids, x => ({ ...x, tipoUsuario: t as TipoTx }));
    toast(`Tipo mudado em ${qtd}.`);
  } else if (a === 'conta') {
    const c = await escolherOpcao(`Conta de ${qtd}`, state.dados.contas.filter(x => x.ativa).map(x => ({ v: x.id, t: x.nome })));
    if (!c) return;
    await editarTxs(ids, x => ({ ...x, conta: c }));
    toast(`Conta mudada em ${qtd}.`);
  } else if (a === 'inverter') {
    await editarTxs(ids, x => ({ ...x, valor: -x.valor }));
    toast(`Sinal invertido em ${qtd}.`);
  } else if (a === 'excluir') {
    const ok = await confirmar(`Excluir ${qtd}?`, 'As que vieram de extrato não voltam ao importar o mesmo arquivo de novo.', { sim: 'Excluir' });
    if (!ok) return;
    await excluirTxs(ids);
    toast(ids.length === 1 ? 'Excluída.' : `${ids.length} excluídas.`);
    sair();
    return;
  }
  dispatchEvent(new Event('rerender'));
}

/** Liga o toque longo e a barra (uma vez, na inicialização). */
export function ativarSelecaoTx() {
  let timer = 0, x0 = 0, y0 = 0;
  const parar = () => { clearTimeout(timer); timer = 0; };
  document.addEventListener('pointerdown', e => {
    ignorarClique = false;
    const b = (e.target as HTMLElement).closest?.(SELETOR);
    if (!b) return;
    x0 = e.clientX; y0 = e.clientY;
    parar();
    timer = window.setTimeout(() => {
      timer = 0;
      ignorarClique = true;
      if (!marcadas) marcadas = new Set();
      marcadas.add(idDe(b));
      aplicarSelecao();
    }, 450);
  }, true);
  document.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) parar(); }, true);
  document.addEventListener('pointerup', parar, true);
  document.addEventListener('pointercancel', parar, true);
  document.addEventListener('contextmenu', e => { if ((e.target as HTMLElement).closest?.(SELETOR)) e.preventDefault(); }, true);
  // No modo de seleção, tocar numa transação marca/desmarca em vez de abrir.
  document.addEventListener('click', e => {
    const alvo = e.target as HTMLElement;
    const sel = alvo.closest?.('[data-sel]') as HTMLElement | null;
    if (sel && sel.closest('#barraSel')) { e.preventDefault(); void acao(sel.dataset.sel!); return; }
    const b = alvo.closest?.(SELETOR);
    if (!b) return;
    if (ignorarClique) { ignorarClique = false; e.preventDefault(); e.stopPropagation(); return; }
    if (!marcadas) return;
    e.preventDefault(); e.stopPropagation();
    const id = idDe(b);
    if (marcadas.has(id)) marcadas.delete(id); else marcadas.add(id);
    aplicarSelecao();
  }, true);
  // Trocar de tela sai do modo de seleção.
  addEventListener('hashchange', () => { if (marcadas) sair(); });
  // Voltar do Android (nav.voltar) com seleção aberta: só sai da seleção.
  addEventListener('sair-selecao', sair);
}
