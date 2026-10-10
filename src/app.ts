// Estado do app e operações que mudam os dados (sempre gravando no aparelho em seguida).
import type { Dados, Transacao } from './core/tipos';
import { classificar, type Classificada } from './core/classificar';
import { receber, reprocessar } from './core/ingestao';
import { regrasDoApp } from './core/regras';
import { aplicarDecisoes, type Decisao, type ResultadoDecisao } from './core/automatica';
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
    cache = { v: state.versao, cls: classificar(d.txs, { contas: d.contas, categorias: d.categorias, regrasCat: d.regrasCat, titular: d.config.titular }) };
  }
  return cache.cls;
}

/** Classifica transações que ainda não foram gravadas (ex.: linhas na pré-visualização da importação). */
export function classificarAvulsas(txs: Transacao[]): Classificada[] {
  const d = state.dados;
  return classificar(txs, { contas: d.contas, categorias: d.categorias, regrasCat: d.regrasCat, titular: d.config.titular });
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

let ultimoEnvio = '';
/**
 * Mantém o Android em dia: pacotes monitorados, regras ativas (para decidir o aviso com o app
 * fechado), nomes dos apps e modo dos avisos. Só envia quando algo mudou.
 */
export async function sincronizarNativo() {
  const d = state.dados;
  const regras = d.apps.flatMap(a => regrasDoApp(d.regras, a.pacote)).map(r => ({ pacote: r.pacote, padrao: r.padrao, acao: r.acao }));
  const nomes = Object.fromEntries(d.apps.map(a => [a.pacote, a.nome]));
  const pacotes = d.apps.filter(a => a.ativo).map(a => a.pacote);
  const chave = JSON.stringify([regras, nomes, pacotes, d.config.avisos]);
  if (chave === ultimoEnvio) return;
  await nativo.definirPacotes({ pacotes });
  await nativo.definirRegras({ regras, nomes, modo: d.config.avisos });
  ultimoEnvio = chave;
}

/** Tira da barra os avisos de notificações que já foram resolvidas. */
export function cancelarAvisos(chaves: string[]) {
  if (chaves.length) void nativo.cancelarAvisos({ chaves }).catch(() => undefined);
}

/** Aplica decisões (botões Adicionar/Ignorar) e devolve o que aconteceu com cada uma. */
export async function decidir(decisoes: Decisao[]): Promise<ResultadoDecisao[]> {
  let res: ResultadoDecisao[] = [];
  await mudar(d => { const r = aplicarDecisoes(d, decisoes); res = r.resultados; return r.dados; });
  cancelarAvisos(decisoes.map(x => x.chave));
  return res;
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
      let novas = 0;
      if (itens.length) {
        await mudar(d => { const r = receber(d, itens); novas = r.novas.length; return r.dados; });
        await nativo.confirmar({ ids: itens.map(i => i.id) });
      }
      // Botões tocados nos avisos com o app fechado (depois da fila: a notificação já está registrada).
      const { itens: decs } = await nativo.lerDecisoes();
      if (decs.length) {
        await mudar(d => aplicarDecisoes(d, decs.map(x => ({ chave: x.chave, acao: x.acao }))).dados);
        await nativo.confirmarDecisoes({ ids: decs.map(x => x.id) });
      }
      return novas;
    } finally { consumindo = null; }
  })());
}

export async function reprocessarNotifs(ids: string[]) {
  await mudar(d => reprocessar(d, ids));
  cancelarAvisos(state.dados.notifs.filter(n => ids.includes(n.id) && n.status !== 'sem-regra' && n.status !== 'erro').map(n => n.id));
}

export function excluirTx(id: string) {
  return mudar(d => {
    const t = d.txs.find(x => x.id === id);
    if (!t) return;
    return { ...d, txs: d.txs.filter(x => x.id !== id), excluidas: [...d.excluidas, ...chavesParaExcluidas(t)],
      revisoes: d.revisoes.map(r => ({ ...r, candidatos: r.candidatos.filter(c => c !== id) })) };
  });
}

/** Exclui várias transações de uma vez (as linhas de extrato delas não voltam ao reimportar). */
export function excluirTxs(ids: string[]) {
  const fora = new Set(ids);
  return mudar(d => ({ ...d, txs: d.txs.filter(x => !fora.has(x.id)), excluidas: [...d.excluidas, ...d.txs.filter(x => fora.has(x.id)).flatMap(chavesParaExcluidas)],
    revisoes: d.revisoes.map(r => ({ ...r, candidatos: r.candidatos.filter(c => !fora.has(c)) })) }));
}

/** Muda várias transações de uma vez. */
export function editarTxs(ids: string[], f: (t: Transacao) => Transacao) {
  const alvo = new Set(ids);
  return mudar(d => ({ ...d, txs: d.txs.map(x => (alvo.has(x.id) ? f(x) : x)) }));
}

export function salvarTx(t: Transacao) {
  return mudar(d => ({ ...d, txs: d.txs.some(x => x.id === t.id) ? d.txs.map(x => (x.id === t.id ? t : x)) : [...d.txs, t] }));
}

export const nomeConta = (id: string) => state.dados.contas.find(c => c.id === id)?.nome || id;
export const nomeApp = (pacote: string) => state.dados.apps.find(a => a.pacote === pacote)?.nome || pacote;
