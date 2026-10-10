// Ajustes > Novidades: o que mudou em cada versão (de src/novidades.json, que também gera as notas
// da Release no GitHub).
import novidades from '../novidades.json';
import { esc, fmtD } from './fmt';

export interface Versao { versao: string; data: string; itens: string[] }
export const VERSOES: Versao[] = novidades.versoes;
export const PROXIMA: string[] = novidades.proxima;

const lista = (itens: string[]) => `<ul class="novidades">${itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;

export function telaNovidades(el: HTMLElement) {
  el.innerHTML = `<p class="note">Você está na versão ${esc(__VERSAO__)}.</p>
  ${PROXIMA.length ? `<section class="caixa"><h2>Ainda não publicadas</h2><p class="sub">Já feitas, entram na próxima versão do app.</p>${lista(PROXIMA)}</section>` : ''}
  ${VERSOES.map(v => `<section class="caixa versao"><div class="row between"><h2>Versão ${esc(v.versao)}</h2><span class="sub">${fmtD(v.data)}</span></div>${lista(v.itens)}</section>`).join('')}`;
}
