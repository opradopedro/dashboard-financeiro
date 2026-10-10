// Navegação por hash (#/rota/param). As abas trocam no lugar (voltar leva ao Painel); as páginas
// empilham, e o botão voltar do Android desempilha. Na raiz do Painel, voltar sai do app.
import { nativo } from '../nativo/notificacoes';

export interface Rota { nome: string; params: string[]; query: URLSearchParams }

export const ABAS = ['', 'transacoes', 'notificacoes', 'importar', 'ajustes'];

let profundidade = 0;

export function rotaAtual(): Rota {
  const h = location.hash.replace(/^#\/?/, '');
  const [caminho, q = ''] = h.split('?');
  const partes = caminho.split('/').map(decodeURIComponent);
  return { nome: partes[0] || '', params: partes.slice(1), query: new URLSearchParams(q) };
}

/** Abre uma página (empilha). */
export function ir(rota: string) {
  profundidade++;
  location.hash = '#/' + rota;
}

/** Troca de aba (não empilha). */
export function aba(rota: string) {
  profundidade = 0;
  location.replace('#/' + rota);
}

/** Substitui a página atual (ex.: depois de salvar uma página nova). */
export const trocar = (rota: string) => location.replace('#/' + rota);

export function voltar() {
  const dlg = document.querySelector('dialog[open]') as HTMLDialogElement | null;
  if (dlg) { dlg.close(); return; }
  if (document.body.classList.contains('selecionando')) { dispatchEvent(new Event('sair-selecao')); return; }
  if (profundidade > 0) { profundidade--; history.back(); return; }
  if (rotaAtual().nome !== '') { aba(''); return; }
  void nativo.sair();
}
