// Estado do app e operações que mudam os dados (sempre gravando no aparelho em seguida).
import type { Dados, Transacao } from './core/tipos';
import { classificar, type Classificada } from './core/classificar';
import { receber, reprocessar } from './core/ingestao';
import { chavesParaExcluidas } from './core/juntar';
import { carregar, gravar } from './dados/db';
import { nativo, type EstadoNativo } from './nativo/notificacoes';

export const state = {
  dados: null as unknown as Dados,
  versao: 0,                 // muda a cada alteração (para refazer a classificação só quando precisa)
  nativo: null as EstadoNativo | null,
};

let cache: { v: number; cls: Classificada[] } | null = null;
/** Transações já classificadas (tipo final e categoria), recalculadas só quando os dados mudam. */
export function classificadas(): Classificada[] {
  if (cache?.v !== state.versao) {
    const d = state.dados;
    cache = { v: state.versao, cls: classificar(d.txs, { contas: d.contas, categorias: d.categorias, regrasCat: d.regrasCat }) };
  }
  return cache.cls;
}

const ouvintes = new Set<() => void>();
export const aoMudar = (f: () => void) => ouvintes.add(f);

let fila: Promise<unknown> = Promise.resolve();
/**
 * Aplica uma mudança e grava. Mudanças são feitas uma de cada vez, na ordem em que chegaram.
 * Se a gravação falhar, a promessa é rejeitada (quem consome a fila nativa não confirma nada).
 */
export function mudar(f: (d: Dados) => Dados | void): Promise<void> {
  const p = fila.then(async () => {
    const novo = f(state.dados) || state.dados;
    await gravar(novo);
    state.dados = novo;
    state.versao++;
    ouvintes.forEach(o => o());
  });
  fila = p.catch(() => undefined);
  return p.catch(e => {
    console.error(e);
    alert('Não consegui gravar os dados no aparelho: ' + (e as Error).message);
    throw e;
  });
}

export async function iniciarDados() {
  state.dados = await carregar();
  state.versao++;
}

/** Diz ao serviço nativo quais pacotes monitorar (o resto é descartado lá mesmo). */
export async function enviarPacotes() {
  await nativo.definirPacotes({ pacotes: state.dados.apps.filter(a => a.ativo).map(a => a.pacote) });
}

export async function atualizarEstado() {
  try { state.nativo = await nativo.estado(); } catch { state.nativo = null; }
  return state.nativo;
}

let consumindo: Promise<number> | null = null;
/**
 * Consome a fila nativa: grava no banco local e só então confirma para o Android apagar.
 * Se o app fechar no meio, os itens continuam na fila e entram na próxima vez (sem duplicar,
 * porque a chave de cada notificação é única).
 */
export function consumirFila(): Promise<number> {
  return (consumindo ||= (async () => {
    try {
      const { itens } = await nativo.lerFila();
      if (!itens.length) return 0;
      let novas = 0;
      await mudar(d => { const r = receber(d, itens); novas = r.novas.length; return r.dados; });
      await nativo.confirmar({ ids: itens.map(i => i.id) });
      return novas;
    } finally { consumindo = null; }
  })());
}

export const reprocessarNotifs = (ids: string[]) => mudar(d => reprocessar(d, ids));

export function excluirTx(id: string) {
  return mudar(d => {
    const t = d.txs.find(x => x.id === id);
    if (!t) return;
    return { ...d, txs: d.txs.filter(x => x.id !== id), excluidas: [...d.excluidas, ...chavesParaExcluidas(t)],
      revisoes: d.revisoes.map(r => ({ ...r, candidatos: r.candidatos.filter(c => c !== id) })) };
  });
}

export function salvarTx(t: Transacao) {
  return mudar(d => ({ ...d, txs: d.txs.some(x => x.id === t.id) ? d.txs.map(x => (x.id === t.id ? t : x)) : [...d.txs, t] }));
}

export const nomeConta = (id: string) => state.dados.contas.find(c => c.id === id)?.nome || id;
export const nomeApp = (pacote: string) => state.dados.apps.find(a => a.pacote === pacote)?.nome || pacote;
