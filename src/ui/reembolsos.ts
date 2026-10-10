// Reembolsos (alguém te devolve o que você pagou): na tela da transação e na lista de entradas que
// podem ser reembolso. Marcar como reembolso tira a entrada das entradas e desconta do gasto.
import { classificadas, editarTxs, nomeConta, state } from '../app';
import type { Classificada, FonteCat } from '../core/classificar';
import { candidatosReembolso, podeSerReembolso, possiveisReembolsos } from '../core/sugestoes';
import { diasEntre } from '../core/util';
import { escolherOpcao } from './escolher';
import { esc, fmtD, sinal, toast } from './fmt';
import { itemTx } from './painel';

/** De onde veio a categoria, em uma frase. */
export function explicarCategoria(x: Classificada) {
  const f: Record<FonteCat, string> = {
    sua: 'Categoria escolhida por você.',
    reembolso: 'Mesma categoria do gasto que esta entrada reembolsa.',
    regra: 'Categoria de uma regra de categoria (Ajustes → Regras).',
    voucher: 'Entrada numa conta de vale: Voucher.',
    salario: 'Pix no seu nome chegando: Salário (mude aqui se não for).',
    contraparte: `Aprendida: você deu esta categoria ${x.aprendida === 1 ? 'a uma transação' : `a ${x.aprendida} transações`} com a mesma pessoa ou loja.`,
    palavra: 'Pela palavra-chave da categoria (Ajustes → Categorias).',
    palavras: `Aprendida: descrição parecida com ${x.aprendida} transações que você colocou nesta categoria.`,
    '': '',
  };
  return f[x.fc] || '';
}

const marcar = async (id: string, gasto: string) => {
  await editarTxs([id], t => { const n = { ...t, reembolsa: gasto }; delete n.semReembolso; return n; });
  toast('Marcada como reembolso: desconta do gasto.');
  dispatchEvent(new Event('rerender'));
};

/** Bloco da tela da transação: reembolso ligado, sugestões, ou quem reembolsou este gasto. */
export function blocoReembolso(x: Classificada) {
  const cls = classificadas();
  const porId = new Map(cls.map(t => [t.id, t]));
  if (x.reembolsa !== undefined) {
    const g = x.reembolsa ? porId.get(x.reembolsa) : undefined;
    return `<section class="panel"><h2>Reembolso</h2>
      ${g ? `<div class="folha"><div class="list">${itemTx(g, true)}</div></div>` : '<p class="sub">Reembolso sem gasto ligado: desconta dos gastos na categoria desta entrada.</p>'}
      <p class="note">Não conta como entrada: desconta do gasto${g ? ' acima' : ''}.</p>
      <div class="row"><button type="button" class="btn small" data-reemb-desfazer>Não é reembolso</button></div></section>`;
  }
  if (x.reembolsos?.length) {
    return `<section class="panel"><h2>Reembolsado por</h2><div class="folha"><div class="list">${x.reembolsos.map(id => porId.get(id)).filter(Boolean).map(t => itemTx(t!, true)).join('')}</div></div>
      <p class="note">O que voltou desconta deste gasto.</p></section>`;
  }
  if (!podeSerReembolso(x)) return '';
  const cands = candidatosReembolso(cls, x);
  return `<section class="panel"><h2>É reembolso?</h2>
    <p class="sub">Se alguém te devolveu um gasto (compra no seu cartão, conta dividida), marque: sai das entradas e desconta do gasto.</p>
    ${cands.length ? `<div class="folha"><div class="list">${cands.map(g => `<div class="cand">${itemTx(g, true)}<button type="button" class="btn small primary" data-reemb="${esc(g.id)}">É deste</button></div>`).join('')}</div></div>` : ''}
    <div class="row"><button type="button" class="btn small" data-reemb-buscar>Procurar o gasto</button>
      <button type="button" class="btn small" data-reemb="">Reembolso sem ligar</button>
      <button type="button" class="btn small" data-reemb-nao>Não é reembolso</button></div></section>`;
}

export function ligarReembolso(el: HTMLElement, x: Classificada) {
  el.querySelectorAll<HTMLButtonElement>('[data-reemb]').forEach(b => (b.onclick = () => void marcar(x.id, b.dataset.reemb || '')));
  el.querySelector('[data-reemb-desfazer]')?.addEventListener('click', async () => {
    await editarTxs([x.id], t => { const n = { ...t }; delete n.reembolsa; return n; });
    toast('Voltou a ser entrada.'); dispatchEvent(new Event('rerender'));
  });
  el.querySelector('[data-reemb-nao]')?.addEventListener('click', async () => {
    await editarTxs([x.id], t => ({ ...t, semReembolso: true }));
    toast('Certo: o app não pergunta mais sobre esta entrada.'); dispatchEvent(new Event('rerender'));
  });
  el.querySelector('[data-reemb-buscar]')?.addEventListener('click', async () => {
    // Gastos de 90 dias antes a 30 dias depois, do mais perto no valor para o mais longe.
    const gastos = classificadas().filter(g => g.t === 'saida' && g.valor < 0 && diasEntre(g.data, x.data) <= (g.data <= x.data ? 90 : 30))
      .sort((a, b) => Math.abs(-a.valor - x.valor) - Math.abs(-b.valor - x.valor));
    if (!gastos.length) { toast('Nenhum gasto por perto.'); return; }
    const id = await escolherOpcao('Gasto reembolsado', gastos.map(g => ({ v: g.id, t: `${g.desc}`, nota: `${sinal(g.valor)}, ${fmtD(g.data)}, ${nomeConta(g.conta)}` })));
    if (id) await marcar(x.id, id);
  });
}

/** Lista de entradas que podem ser reembolso (aviso do Painel). */
export function telaReembolsos(el: HTMLElement) {
  const lista = possiveisReembolsos(classificadas()).sort((a, b) => b.x.data.localeCompare(a.x.data));
  el.innerHTML = `<p class="sub">Entradas com um gasto de mesmo valor por perto. Se for alguém te devolvendo esse gasto, marque: sai das entradas e desconta do gasto. Se não for, toque em “Não é”.</p>
    ${lista.map(({ x, cands }) => `<section class="caixa">
      <div class="folha"><div class="list">${itemTx(x, true)}</div></div>
      <p class="sub">Pode ser reembolso de:</p>
      <div class="list">${cands.map(g => `<div class="cand">${itemTx(g, true)}<button type="button" class="btn small primary" data-ligar="${esc(x.id)}" data-gasto="${esc(g.id)}">É deste</button></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-nao="${esc(x.id)}">Não é reembolso</button></div>
    </section>`).join('') || '<div class="empty">Nada para revisar.</div>'}`;
  el.querySelectorAll<HTMLButtonElement>('[data-ligar]').forEach(b => (b.onclick = () => void marcar(b.dataset.ligar!, b.dataset.gasto!)));
  el.querySelectorAll<HTMLButtonElement>('[data-nao]').forEach(b => (b.onclick = async () => {
    await editarTxs([b.dataset.nao!], t => ({ ...t, semReembolso: true }));
    dispatchEvent(new Event('rerender'));
  }));
}

/** Quantas entradas pedem revisão de reembolso (para o aviso do Painel). */
export const nReembolsosPendentes = () => (state.dados.txs.length ? possiveisReembolsos(classificadas()).length : 0);
