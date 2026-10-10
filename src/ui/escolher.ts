// Escolha de categoria: lista em folha que sobe de baixo, com busca enquanto digita e
// "+ Adicionar categoria" quando o que foi digitado não existe. Substitui o <select> nativo
// (lista do Android, sem busca).
import { mudar, state } from '../app';
import { SEM_CATEGORIA } from '../core/classificar';
import type { Categoria } from '../core/tipos';
import { norm } from '../core/util';
import { $, esc, toast } from './fmt';

interface Opcoes {
  vazio?: string;               // rótulo da opção sem categoria ('' = sem essa opção)
  receita?: () => boolean;      // categoria nova é de entrada?
}

const ICONE_SETA = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const ICONE_OK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

/** Campo que mostra a categoria escolhida (o valor fica em data-valor). */
export function campoCategoria(id: string, valor: string, vazio = SEM_CATEGORIA) {
  return `<button type="button" class="campo-sel${valor ? '' : ' vazio'}" id="${id}" data-valor="${esc(valor)}" aria-haspopup="dialog">
    <span>${esc(valor || vazio)}</span>${ICONE_SETA}</button>`;
}

export const valorCampo = (id: string) => ($('#' + id) as HTMLElement | null)?.dataset.valor || '';

/** Liga o campo à folha de escolha. */
export function ligarCampoCategoria(id: string, op: Opcoes = {}) {
  const b = $('#' + id) as HTMLButtonElement | null;
  if (!b) return;
  const vazio = op.vazio ?? SEM_CATEGORIA;
  b.onclick = async () => {
    const r = await escolherCategoria(b.dataset.valor || '', { ...op, vazio });
    if (r === null) return;
    b.dataset.valor = r;
    b.classList.toggle('vazio', !r);
    b.querySelector('span')!.textContent = r || vazio;
    b.dispatchEvent(new Event('change', { bubbles: true }));
  };
}

/** Abre a folha. Devolve o nome escolhido, '' para sem categoria, ou null se fechou sem escolher. */
export function escolherCategoria(atual: string, op: Opcoes = {}): Promise<string | null> {
  const vazio = op.vazio ?? SEM_CATEGORIA;
  return new Promise(resolve => {
    let escolhido: string | null = null;
    const dlg = document.createElement('dialog');
    dlg.className = 'folha-sel';
    dlg.setAttribute('aria-label', 'Escolher categoria');
    dlg.innerHTML = `<div class="folha-sel-cab">
        <input type="search" id="selBusca" autofocus placeholder="Buscar ou criar categoria" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" aria-label="Buscar categoria">
        <button type="button" class="btn small" id="selFechar">Fechar</button>
      </div>
      <div class="folha-sel-lista" id="selLista" role="listbox"></div>`;
    document.body.appendChild(dlg);
    const busca = dlg.querySelector('#selBusca') as HTMLInputElement;
    const listaEl = dlg.querySelector('#selLista') as HTMLElement;

    const item = (valor: string, rotulo: string, extra = '') => `<button type="button" class="sel-op${valor === atual ? ' atual' : ''}${extra}" data-v="${esc(valor)}" role="option" aria-selected="${valor === atual}">
      <span>${esc(rotulo)}</span>${valor === atual ? ICONE_OK : ''}</button>`;

    const desenhar = () => {
      const q = norm(busca.value).trim();
      const cats = state.dados.categorias;
      const bate = (c: Categoria) => !q || norm(c.nome).includes(q);
      const gastos = cats.filter(c => !c.receita && bate(c)), entradas = cats.filter(c => c.receita && bate(c));
      const exata = cats.some(c => norm(c.nome).trim() === q);
      const texto = busca.value.trim();
      listaEl.innerHTML = `
        ${vazio && !q ? item('', vazio, ' sem') : ''}
        ${gastos.length ? `<p class="sel-grupo">Gastos</p>${gastos.map(c => item(c.nome, c.nome)).join('')}` : ''}
        ${entradas.length ? `<p class="sel-grupo">Entradas</p>${entradas.map(c => item(c.nome, c.nome)).join('')}` : ''}
        ${q && !gastos.length && !entradas.length ? '<p class="sel-nada">Nenhuma categoria com esse nome.</p>' : ''}
        ${q && !exata ? `<button type="button" class="sel-op sel-nova" data-nova="1"><span>+ Adicionar categoria “${esc(texto)}”</span></button>` : ''}`;
    };

    const adicionar = async () => {
      const t = busca.value.trim().replace(/\s+/g, ' ');
      if (!t) return;
      const nome = t.charAt(0).toUpperCase() + t.slice(1);
      const receita = op.receita?.() ?? false;
      await mudar(d => ({ ...d, categorias: [...d.categorias, { nome, receita, palavras: [] }] }));
      toast(`Categoria “${nome}” criada${receita ? ' (de entrada)' : ''}.`);
      escolhido = nome;
      dlg.close();
    };

    listaEl.onclick = e => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.nova) { void adicionar(); return; }
      escolhido = b.dataset.v ?? '';
      dlg.close();
    };
    busca.oninput = desenhar;
    busca.onkeydown = e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // Enter: a única (ou a primeira) da lista; sem nenhuma, cria.
      const primeira = listaEl.querySelector<HTMLButtonElement>('.sel-op:not(.sem)');
      if (primeira) primeira.click();
    };
    (dlg.querySelector('#selFechar') as HTMLButtonElement).onclick = () => dlg.close();
    // Toque fora da folha fecha.
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(escolhido); });

    desenhar();
    dlg.showModal();
    listaEl.querySelector('.atual')?.scrollIntoView({ block: 'center' });
  });
}
