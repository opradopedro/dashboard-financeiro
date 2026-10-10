// Filtro do Painel (e das listas de entradas/saídas): ícone ao lado do mês, folha para escolher
// contas, formas de pagamento e categorias, filtros salvos (vários ao mesmo tempo) e a tela para
// editar ou excluir os salvos.
import { classificadas, mudar, nomeConta, state } from '../app';
import { SEM_CATEGORIA, type Classificada } from '../core/classificar';
import { ehVazio, filtrar, filtroVazio, juntarFiltros } from '../core/filtros';
import { FORMAS } from '../core/indicadores';
import type { Filtro, FiltroSalvo } from '../core/tipos';
import { uid } from '../core/util';
import { confirmar } from './escolher';
import { esc, toast } from './fmt';

// Filtro em uso (só na memória: ao abrir o app, começa sem filtro).
let salvosAtivos: string[] = [];
let proprio: Filtro = filtroVazio();

const ICONE_FILTRO = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z"/></svg>';

const salvo = (id: string) => state.dados.filtros.find(f => f.id === id);

/** O filtro que vale agora: os salvos escolhidos mais as escolhas soltas. */
export function filtroAtivo(): Filtro {
  salvosAtivos = salvosAtivos.filter(id => salvo(id));
  return juntarFiltros([...salvosAtivos.map(id => salvo(id)!), proprio]);
}

export const temFiltro = () => !ehVazio(filtroAtivo());

/** Transações classificadas que passam no filtro em uso. */
export const clsFiltradas = (): Classificada[] => filtrar(filtroAtivo(), classificadas(), state.dados.contas);

/** Texto curto do que o filtro escolhe: "Nubank crédito, Pix, Mercado". */
export function descreverFiltro(f: Filtro) {
  return [...f.contas.map(nomeConta), ...f.formas.map(x => FORMAS[x as keyof typeof FORMAS] || x), ...f.cats].join(', ');
}

/** Botão do filtro (ícone pequeno), com marca quando há filtro. */
export const botaoFiltro = () => `<button type="button" class="filtro-btn${temFiltro() ? ' on' : ''}" data-filtro aria-label="${temFiltro() ? 'Filtro ligado: mudar' : 'Filtrar'}">${ICONE_FILTRO}</button>`;

/** Linha que diz o que está filtrado, com "Limpar". */
export function linhaFiltro() {
  if (!temFiltro()) return '';
  const nomes = salvosAtivos.map(id => salvo(id)!.nome);
  const solto = descreverFiltro(proprio);
  return `<div class="filtro-linha"><span>Filtrando por ${esc([...nomes.map(n => `“${n}”`), solto].filter(Boolean).join(', '))}.</span>
    <button type="button" class="btn small" data-filtro-limpar>Limpar</button></div>`;
}

/** Liga o botão do filtro e o "Limpar" da tela. */
export function ligarFiltro(el: HTMLElement) {
  el.querySelectorAll<HTMLButtonElement>('[data-filtro]').forEach(b => (b.onclick = () => void abrirFiltro()));
  el.querySelectorAll<HTMLButtonElement>('[data-filtro-limpar]').forEach(b => (b.onclick = () => {
    salvosAtivos = []; proprio = filtroVazio();
    dispatchEvent(new Event('rerender'));
  }));
}

// ---------- Folha de escolha ----------

interface Resultado { filtro: Filtro; salvos: string[]; nome: string; acao: 'aplicar' | 'salvar' | 'excluir' }

const chips = (campo: string, itens: { v: string; t: string }[], sel: string[]) =>
  `<div class="chips">${itens.map(i => `<button type="button" data-campo="${campo}" data-v="${esc(i.v)}" aria-pressed="${sel.includes(i.v)}">${esc(i.t)}</button>`).join('')}</div>`;

/**
 * Folha com as escolhas. Modo "aplicar" (no Painel): filtros salvos + escolhas soltas, com Aplicar,
 * Limpar e Salvar como filtro. Modo "editar" (filtro salvo): nome + escolhas, com Salvar e Excluir.
 */
function folhaFiltro(modo: 'aplicar' | 'editar', inicial: Filtro, op: { nome?: string; salvos?: string[] } = {}): Promise<Resultado | null> {
  return new Promise(resolve => {
    let r: Resultado | null = null;
    const f: Filtro = { contas: [...inicial.contas], formas: [...inicial.formas], cats: [...inicial.cats] };
    let salvos = [...(op.salvos || [])];
    const d = state.dados;
    const dlg = document.createElement('dialog');
    dlg.className = 'folha-sel folha-filtro';
    dlg.setAttribute('aria-label', modo === 'editar' ? 'Editar filtro' : 'Filtrar');
    document.body.appendChild(dlg);
    const desenhar = () => {
      const cats = [...d.categorias.filter(c => !c.receita), ...d.categorias.filter(c => c.receita)].map(c => ({ v: c.nome, t: c.nome }));
      dlg.innerHTML = `<div class="folha-sel-cab"><h2 class="folha-sel-titulo">${modo === 'editar' ? (op.nome ? 'Editar filtro' : 'Novo filtro') : 'Filtrar'}</h2>
          <button type="button" class="btn small" data-fechar>Fechar</button></div>
        <div class="filtro-corpo">
          ${modo === 'editar' ? `<div class="field"><label for="fNome">Nome do filtro</label><input id="fNome" value="${esc(op.nome || '')}" placeholder="Ex.: Cartões" autocomplete="off"></div>` : ''}
          ${modo === 'aplicar' && d.filtros.length ? `<div class="filtro-grupo"><div class="row between"><h3>Filtros salvos</h3><button type="button" class="link-btn" data-ir-filtros>Editar</button></div>
            <p class="note">Escolha um ou mais; dá para somar com as escolhas abaixo.</p>${chips('salvo', d.filtros.map(x => ({ v: x.id, t: x.nome })), salvos)}</div>` : ''}
          <div class="filtro-grupo"><h3>Contas</h3>${chips('contas', d.contas.filter(c => c.ativa || f.contas.includes(c.id)).map(c => ({ v: c.id, t: c.nome })), f.contas)}</div>
          <div class="filtro-grupo"><h3>Forma de pagamento</h3><p class="note">Vale para gastos.</p>${chips('formas', Object.entries(FORMAS).map(([v, t]) => ({ v, t })), f.formas)}</div>
          <div class="filtro-grupo"><h3>Categorias</h3>${chips('cats', [...cats, { v: SEM_CATEGORIA, t: SEM_CATEGORIA }], f.cats)}</div>
          ${modo === 'aplicar' ? `<div class="filtro-salvar"><div class="field"><label for="fNovoNome">Salvar estas escolhas como filtro</label>
              <div class="row nowrap"><input id="fNovoNome" placeholder="Nome (ex.: Cartões)" autocomplete="off"><button type="button" class="btn small" data-salvar-novo>Salvar</button></div></div></div>` : ''}
        </div>
        <div class="filtro-rodape row">${modo === 'aplicar'
          ? '<button type="button" class="btn primary" data-aplicar>Aplicar</button><button type="button" class="btn" data-limpar>Limpar</button>'
          : `<button type="button" class="btn primary" data-salvar>Salvar</button>${op.nome ? '<button type="button" class="btn danger" data-excluir>Excluir</button>' : ''}`}</div>`;
    };
    const nome = (id: string) => (dlg.querySelector<HTMLInputElement>(id)?.value || '').trim();
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { dlg.close(); return; }
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.campo) {
        const v = b.dataset.v!;
        if (b.dataset.campo === 'salvo') salvos = salvos.includes(v) ? salvos.filter(x => x !== v) : [...salvos, v];
        else { const k = b.dataset.campo as keyof Filtro; f[k] = f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v]; }
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        return;
      }
      if (b.hasAttribute('data-fechar')) dlg.close();
      else if (b.hasAttribute('data-aplicar')) { r = { filtro: f, salvos, nome: '', acao: 'aplicar' }; dlg.close(); }
      else if (b.hasAttribute('data-limpar')) { r = { filtro: filtroVazio(), salvos: [], nome: '', acao: 'aplicar' }; dlg.close(); }
      else if (b.hasAttribute('data-salvar-novo')) {
        if (!nome('#fNovoNome')) { toast('Escreva um nome para o filtro.'); return; }
        r = { filtro: juntarFiltros([...salvos.map(id => salvo(id)!).filter(Boolean), f]), salvos, nome: nome('#fNovoNome'), acao: 'salvar' }; dlg.close();
      } else if (b.hasAttribute('data-salvar')) {
        if (!nome('#fNome')) { toast('Escreva um nome para o filtro.'); return; }
        r = { filtro: f, salvos: [], nome: nome('#fNome'), acao: 'salvar' }; dlg.close();
      } else if (b.hasAttribute('data-excluir')) { r = { filtro: f, salvos: [], nome: '', acao: 'excluir' }; dlg.close(); }
      else if (b.hasAttribute('data-ir-filtros')) { dlg.close(); location.hash = '#/filtros'; }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(r); });
    desenhar();
    dlg.showModal();
    dlg.querySelector<HTMLButtonElement>('[data-fechar]')?.focus();
  });
}

/** Folha do Painel: escolher e aplicar (ou salvar) o filtro. */
async function abrirFiltro() {
  const r = await folhaFiltro('aplicar', proprio, { salvos: salvosAtivos });
  if (!r) return;
  if (r.acao === 'salvar') {
    if (ehVazio(r.filtro)) { toast('Escolha ao menos uma conta, forma ou categoria para salvar.'); return; }
    const igual = state.dados.filtros.find(x => x.nome.toLowerCase() === r.nome.toLowerCase());
    if (igual && !(await confirmar('Filtro repetido', `Já existe um filtro chamado “${igual.nome}”. Deseja substituir?`, { sim: 'Substituir' }))) return;
    const novo: FiltroSalvo = { id: igual?.id || uid('f'), nome: r.nome, ...r.filtro };
    await mudar(d => ({ ...d, filtros: [...d.filtros.filter(x => x.id !== novo.id), novo] }));
    salvosAtivos = [novo.id]; proprio = filtroVazio();
    toast(`Filtro “${novo.nome}” salvo e em uso.`);
  } else { salvosAtivos = r.salvos; proprio = r.filtro; }
  dispatchEvent(new Event('rerender'));
}

// ---------- Filtros salvos (Ajustes) ----------

async function editarSalvo(id: string | null) {
  const atual = id ? salvo(id) : undefined;
  const r = await folhaFiltro('editar', atual || filtroVazio(), { nome: atual?.nome || '' });
  if (!r) return;
  if (r.acao === 'excluir' && atual) {
    if (!(await confirmar('Excluir filtro?', `O filtro “${atual.nome}” sai da lista. As transações não mudam.`, { sim: 'Excluir' }))) return;
    await mudar(d => ({ ...d, filtros: d.filtros.filter(x => x.id !== atual.id) }));
    salvosAtivos = salvosAtivos.filter(x => x !== atual.id);
    toast('Filtro excluído.');
  } else if (r.acao === 'salvar') {
    if (ehVazio(r.filtro)) { toast('Escolha ao menos uma conta, forma ou categoria.'); return; }
    const igual = state.dados.filtros.find(x => x.id !== id && x.nome.toLowerCase() === r.nome.toLowerCase());
    if (igual && !(await confirmar('Filtro repetido', `Já existe um filtro chamado “${igual.nome}”. Deseja continuar?`, { sim: 'Salvar mesmo assim' }))) return;
    const novo: FiltroSalvo = { id: id || uid('f'), nome: r.nome, ...r.filtro };
    await mudar(d => ({ ...d, filtros: id ? d.filtros.map(x => (x.id === id ? novo : x)) : [...d.filtros, novo] }));
    toast('Filtro salvo.');
  }
  dispatchEvent(new Event('rerender'));
}

export function telaFiltros(el: HTMLElement) {
  const fs = state.dados.filtros;
  el.innerHTML = `<p class="sub">Filtros que você salvou para o Painel. No Painel, toque no ícone de filtro ao lado do mês para usar um ou mais deles ao mesmo tempo.</p>
    <div class="folha"><div class="list">${fs.map(f => `<button type="button" class="item" data-editar="${esc(f.id)}">
      <div class="name">${esc(f.nome)}</div><div class="val sub">${salvosAtivos.includes(f.id) ? 'em uso' : ''}</div>
      <div class="meta">${esc(descreverFiltro(f))}</div><div class="meta r"></div></button>`).join('') || '<div class="empty">Nenhum filtro salvo ainda.</div>'}</div></div>
    <div class="row"><button type="button" class="btn primary" id="btnNovoFiltro">Novo filtro</button></div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-editar]').forEach(b => (b.onclick = () => void editarSalvo(b.dataset.editar!)));
  (el.querySelector('#btnNovoFiltro') as HTMLButtonElement).onclick = () => void editarSalvo(null);
}
