// Deduplicação: o mesmo gasto pode chegar por notificação, lançamento manual e extrato.
// - Reimportar o mesmo extrato não cria nada (cada linha tem uma chave estável).
// - Linha de extrato que corresponde a uma transação de notificação/manual (mesma conta, mesmo
//   valor, data próxima) é unida a ela: o extrato prevalece e a origem fica registrada.
// - Casos duvidosos (mais de um candidato, ou data a 2–3 dias) vão para revisão.
import type { Importacao, LinhaExtrato, Origem, Revisao, TipoTx, Transacao } from './tipos';
import { arred, diasEntre, norm, uid } from './util';

/** Janela para considerar a mesma transação (dias). Até PERTO une sozinho; até LONGE pede revisão. */
export const PERTO = 1;
export const LONGE = 3;

export interface LinhaBruta { data: string; desc: string; valor: number; id?: string; saldo?: number }

/**
 * Saldo depois do movimento mais recente do arquivo (extratos trazem o saldo linha a linha).
 * O arquivo pode vir do mais novo para o mais antigo ou ao contrário: no mesmo dia, vale a ordem dele.
 */
export function saldoMaisRecente(linhas: LinhaBruta[]): { data: string; valor: number } | null {
  const com = linhas.filter(l => l.saldo != null && Number.isFinite(l.saldo));
  if (!com.length) return null;
  const decrescente = com[0].data > com[com.length - 1].data;
  const ordem = decrescente ? [...com].reverse() : com;
  const ult = ordem.reduce((a, l) => (l.data >= a.data ? l : a));
  return { data: ult.data, valor: ult.saldo! };
}

/**
 * Chave estável de cada linha: com id do banco (FITID do OFX), usa ele; sem id, usa os dados e a
 * ordem entre linhas idênticas (duas compras iguais no mesmo dia continuam sendo duas).
 */
export function chavesDasLinhas(conta: string, linhas: LinhaBruta[]): LinhaExtrato[] {
  const ordem = new Map<string, number>();
  return linhas.map(l => {
    const valor = arred(l.valor);
    let chave: string;
    if (l.id) chave = `id:${conta}:${l.id}`;
    else {
      const base = `${conta}|${l.data}|${valor.toFixed(2)}|${norm(l.desc).trim()}`;
      const n = (ordem.get(base) || 0) + 1; ordem.set(base, n);
      chave = `${base}|${n}`;
    }
    return { conta, data: l.data, desc: l.desc.trim() || '(sem descrição)', valor, chave };
  });
}

const temExtrato = (t: Transacao) => t.origens.some(o => o.tipo === 'extrato');

/** Transações que podem ser esta linha: mesma conta e valor, ainda sem extrato, até LONGE dias. */
export function candidatos(l: Pick<LinhaExtrato, 'conta' | 'data' | 'valor'>, txs: Transacao[]): Transacao[] {
  return txs.filter(t => t.conta === l.conta && !temExtrato(t) && Math.abs(t.valor - l.valor) < 0.005 && diasEntre(t.data, l.data) <= LONGE)
    .sort((a, b) => diasEntre(a.data, l.data) - diasEntre(b.data, l.data));
}

const origemExtrato = (l: LinhaExtrato, arquivo: string, em: string): Origem =>
  ({ tipo: 'extrato', ref: l.chave, em, data: l.data, desc: l.desc, valor: l.valor, arquivo });

/** Categoria e tipo escolhidos na pré-visualização. */
const escolhas = (l: LinhaExtrato) => ({ ...(l.cat ? { cat: l.cat } : {}), ...(l.tipoUsuario ? { tipoUsuario: l.tipoUsuario } : {}) });

/** Une a linha à transação: o extrato prevalece (data, descrição e valor) e a origem fica registrada. */
export function unir(t: Transacao, l: LinhaExtrato, arquivo: string, em: string): Transacao {
  return { ...t, data: l.data, desc: l.desc, valor: l.valor, ...escolhas(l), origens: [...t.origens, origemExtrato(l, arquivo, em)] };
}

export function novaDeExtrato(l: LinhaExtrato, arquivo: string, em: string): Transacao {
  return { id: uid('t'), conta: l.conta, data: l.data, desc: l.desc, valor: l.valor, ...escolhas(l), origens: [origemExtrato(l, arquivo, em)], criadoEm: em };
}

/** Mudanças feitas nas linhas antes de importar (pelo índice da linha no arquivo). */
export interface Edicoes { excluir: number[]; inverter: number[]; cat: Record<number, string>; tipo: Record<number, TipoTx> }
export const edicoesVazias = (): Edicoes => ({ excluir: [], inverter: [], cat: {}, tipo: {} });

/**
 * Aplica as mudanças da pré-visualização. A chave continua a da linha original, para que
 * reimportar o mesmo arquivo reconheça a linha (inclusive invertida). Linhas tiradas viram
 * "excluídas": reimportar não as traz de volta.
 */
export function aplicarEdicoes(ls: LinhaExtrato[], ed?: Edicoes): { linhas: LinhaExtrato[]; excluidas: string[] } {
  if (!ed) return { linhas: ls, excluidas: [] };
  const fora = new Set(ed.excluir), inv = new Set(ed.inverter);
  const linhas: LinhaExtrato[] = [], excluidas: string[] = [];
  ls.forEach((l, i) => {
    if (fora.has(i)) { excluidas.push(l.chave); return; }
    linhas.push({ ...l, valor: inv.has(i) ? -l.valor : l.valor, ...(ed.cat[i] ? { cat: ed.cat[i] } : {}), ...(ed.tipo[i] ? { tipoUsuario: ed.tipo[i] } : {}) });
  });
  return { linhas, excluidas };
}

/** Transações que vieram de uma importação (pela origem de extrato com o mesmo arquivo e horário). */
export const txsDaImportacao = (txs: Transacao[], imp: Importacao) =>
  txs.filter(t => t.origens.some(o => o.tipo === 'extrato' && o.em === imp.em && o.arquivo === imp.arquivo));

export interface EstadoJuntar { txs: Transacao[]; revisoes: Revisao[]; excluidas: string[] }

export interface ResultadoImport extends EstadoJuntar { importacao: Importacao }

/** Importa as linhas de extrato sem duplicar. Não altera o estado recebido. */
export function importarLinhas(est: EstadoJuntar, linhas: LinhaExtrato[], arquivo: string, em = new Date().toISOString()): ResultadoImport {
  const txs = [...est.txs];
  const revisoes = [...est.revisoes];
  const conhecidas = new Set<string>(est.excluidas);
  for (const t of txs) for (const o of t.origens) if (o.tipo === 'extrato') conhecidas.add(o.ref);
  for (const r of revisoes) conhecidas.add(r.linha.chave);
  const emRevisao = () => new Set(revisoes.flatMap(r => r.candidatos));
  const imp: Importacao = { id: uid('i'), arquivo, conta: linhas[0]?.conta || '', em, de: '', ate: '', novas: 0, unidas: 0, revisao: 0, repetidas: 0 };
  for (const l of linhas) {
    if (!imp.de || l.data < imp.de) imp.de = l.data;
    if (!imp.ate || l.data > imp.ate) imp.ate = l.data;
    if (conhecidas.has(l.chave)) { imp.repetidas++; continue; }
    conhecidas.add(l.chave);
    const cands = candidatos(l, txs);
    const perto = cands.filter(t => diasEntre(t.data, l.data) <= PERTO);
    const reservados = emRevisao();
    if (cands.length === 1 && perto.length === 1 && !reservados.has(cands[0].id)) {
      const i = txs.indexOf(cands[0]);
      txs[i] = unir(cands[0], l, arquivo, em);
      imp.unidas++;
    } else if (cands.length) {
      revisoes.push({ id: uid('r'), linha: l, candidatos: cands.map(t => t.id), arquivo, em });
      imp.revisao++;
    } else {
      txs.push(novaDeExtrato(l, arquivo, em));
      imp.novas++;
    }
  }
  return { txs, revisoes, excluidas: est.excluidas, importacao: imp };
}

/** Resolve uma revisão: une a linha à transação escolhida, ou cria uma nova (escolha = null). */
export function resolverRevisao(est: EstadoJuntar, revId: string, escolha: string | null): EstadoJuntar {
  const r = est.revisoes.find(x => x.id === revId);
  if (!r) return est;
  const revisoes = est.revisoes.filter(x => x.id !== revId);
  const alvo = escolha ? est.txs.find(t => t.id === escolha && !temExtrato(t)) : undefined;
  const txs = alvo
    ? est.txs.map(t => (t === alvo ? unir(t, r.linha, r.arquivo, new Date().toISOString()) : t))
    : [...est.txs, novaDeExtrato(r.linha, r.arquivo, new Date().toISOString())];
  return { txs, revisoes, excluidas: est.excluidas };
}

/**
 * Notificação que chega depois do extrato: se houver uma (e só uma) transação do extrato sem
 * notificação, na mesma conta e valor, até PERTO dias, a notificação é ligada a ela.
 */
export function correspondenteDoExtrato(txs: Transacao[], conta: string, data: string, valor: number): Transacao | null {
  const c = txs.filter(t => t.conta === conta && temExtrato(t) && !t.origens.some(o => o.tipo !== 'extrato')
    && Math.abs(t.valor - valor) < 0.005 && diasEntre(t.data, data) <= PERTO);
  return c.length === 1 ? c[0] : null;
}

/** Ao excluir uma transação, lembra as linhas de extrato dela para que reimportar não a traga de volta. */
export function chavesParaExcluidas(t: Transacao): string[] {
  return t.origens.filter(o => o.tipo === 'extrato').map(o => o.ref);
}

export interface Conferencia {
  bateu: Transacao[];        // extrato + notificação/manual
  soExtrato: Transacao[];
  soNotificacao: Transacao[]; // notificação ou manual, sem extrato
  revisao: Revisao[];
  periodo: { de: string; ate: string } | null; // período coberto pelos extratos importados no mês
}

/** Conferência mensal de uma conta: o que bateu, o que só está no extrato e o que só veio por notificação/manual. */
export function conferencia(txs: Transacao[], revisoes: Revisao[], importacoes: Importacao[], conta: string, mes: string): Conferencia {
  const doMes = txs.filter(t => t.conta === conta && t.data.slice(0, 7) === mes).sort((a, b) => a.data.localeCompare(b.data));
  const out: Conferencia = { bateu: [], soExtrato: [], soNotificacao: [], revisao: revisoes.filter(r => r.linha.conta === conta && r.linha.data.slice(0, 7) === mes), periodo: null };
  for (const t of doMes) {
    const ext = temExtrato(t), outra = t.origens.some(o => o.tipo !== 'extrato');
    (ext && outra ? out.bateu : ext ? out.soExtrato : out.soNotificacao).push(t);
  }
  const ini = `${mes}-01`, fim = `${mes}-31`;
  for (const i of importacoes) {
    if (i.conta !== conta || !i.de || i.ate < ini || i.de > fim) continue;
    const de = i.de < ini ? ini : i.de, ate = i.ate > fim ? fim : i.ate;
    out.periodo = out.periodo ? { de: de < out.periodo.de ? de : out.periodo.de, ate: ate > out.periodo.ate ? ate : out.periodo.ate } : { de, ate };
  }
  return out;
}

/**
 * Desfaz importações: transações que vieram só delas saem; as que já existiam (notificação ou
 * manual) perdem a origem de extrato e voltam aos dados de antes; revisões delas somem. As linhas
 * não ficam como excluídas: dá para importar os arquivos de novo.
 */
export function desfazerImportacoes<T extends EstadoJuntar & { importacoes: Importacao[] }>(est: T, ids: string[]): T & { removidas: number; restauradas: number } {
  const imps = est.importacoes.filter(i => ids.includes(i.id));
  const daqui = (o: Origem) => o.tipo === 'extrato' && imps.some(i => i.em === o.em && i.arquivo === o.arquivo);
  let removidas = 0, restauradas = 0;
  const txs: Transacao[] = [];
  for (const t of est.txs) {
    if (!t.origens.some(daqui)) { txs.push(t); continue; }
    const resto = t.origens.filter(o => !daqui(o));
    if (!resto.length) { removidas++; continue; }
    // Volta aos dados de como chegou antes do extrato (a primeira origem que sobrou).
    const o = resto[0];
    txs.push({ ...t, data: o.data, desc: o.desc, valor: o.valor, origens: resto });
    restauradas++;
  }
  const fora = new Set(txs.map(t => t.id));
  const revisoes = est.revisoes
    .filter(r => !imps.some(i => i.em === r.em && i.arquivo === r.arquivo))
    .map(r => ({ ...r, candidatos: r.candidatos.filter(c => fora.has(c)) }));
  return { ...est, txs, revisoes, importacoes: est.importacoes.filter(i => !ids.includes(i.id)), removidas, restauradas };
}
