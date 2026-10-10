// Caminho único de toda notificação (real ou simulada): fila nativa → registro → regras → transação.
import type { Dados, FiltroNotif, Notificacao, Transacao } from './tipos';
import { filtrarNotif, processar } from './regras';
import { correspondenteDoExtrato } from './juntar';
import { uid } from './util';

/** Item como vem da fila nativa do Android (ou do simulador, que usa a mesma fila). */
export interface ItemFila { chave: string; pacote: string; titulo: string; texto: string; quando: number; simulada?: boolean }

/** Limite do registro de notificações (as mais antigas saem primeiro). */
export const MAX_NOTIFS = 5000;

/** Passa uma notificação pelas regras e cria (ou liga) a transação. Não altera os arrays recebidos. */
export function aplicarNotif(d: Pick<Dados, 'txs' | 'regras' | 'contas'> & { filtro?: FiltroNotif }, n: Notificacao): { txs: Transacao[]; notif: Notificacao } {
  // Filtro de Ajustes → Avançado: propaganda sem valor, empréstimo… nem passa pelas regras.
  const motivo = d.filtro ? filtrarNotif(n, d.filtro) : null;
  if (motivo) return { txs: d.txs, notif: { ...n, status: 'ignorada', regra: undefined, tx: undefined, erro: undefined, filtro: motivo } };
  const res = processar(n, d.regras, d.contas);
  const base: Notificacao = { ...n, status: res.status, regra: undefined, tx: undefined, erro: undefined, filtro: undefined };
  if (res.status === 'sem-regra') return { txs: d.txs, notif: base };
  if (res.status === 'erro') return { txs: d.txs, notif: { ...base, regra: res.regra.id, erro: res.erro } };
  if (res.status === 'ignorada') return { txs: d.txs, notif: { ...base, regra: res.regra.id } };
  const em = new Date().toISOString();
  const origem = { tipo: 'notificacao' as const, ref: n.id, em, data: res.tx.data, desc: res.tx.desc, valor: res.tx.valor };
  const ext = correspondenteDoExtrato(d.txs, res.tx.conta, res.tx.data, res.tx.valor);
  if (ext) {
    // O extrato já tinha esta transação: só registra a notificação como origem (o extrato prevalece).
    const t = { ...ext, origens: [...ext.origens, origem], tipo: ext.tipo ?? res.tx.tipo };
    return { txs: d.txs.map(x => (x === ext ? t : x)), notif: { ...base, regra: res.regra.id, tx: t.id } };
  }
  const t: Transacao = { id: uid('t'), conta: res.tx.conta, data: res.tx.data, desc: res.tx.desc, valor: res.tx.valor, tipo: res.tx.tipo, origens: [origem], criadoEm: em };
  return { txs: [...d.txs, t], notif: { ...base, regra: res.regra.id, tx: t.id } };
}

/**
 * Recebe itens da fila. Ignora o que já foi registrado (mesma chave) e o que não é de app
 * monitorado ativo (descartado sem gravar). Devolve os dados novos e quantas entraram.
 */
export function receber(d: Dados, itens: ItemFila[]): { dados: Dados; novas: Notificacao[] } {
  const monitorados = new Set(d.apps.filter(a => a.ativo).map(a => a.pacote));
  const vistas = new Set(d.notifs.map(n => n.id));
  let txs = d.txs;
  const novas: Notificacao[] = [];
  for (const it of [...itens].sort((a, b) => a.quando - b.quando)) {
    if (vistas.has(it.chave) || !monitorados.has(it.pacote)) continue;
    vistas.add(it.chave);
    const n0: Notificacao = { id: it.chave, pacote: it.pacote, titulo: it.titulo || '', texto: it.texto || '', quando: it.quando, status: 'sem-regra', ...(it.simulada ? { simulada: true } : {}) };
    const r = aplicarNotif({ txs, regras: d.regras, contas: d.contas, filtro: d.config.filtroNotif }, n0);
    txs = r.txs;
    novas.push(r.notif);
  }
  if (!novas.length) return { dados: d, novas };
  const notifs = [...d.notifs, ...novas].sort((a, b) => a.quando - b.quando).slice(-MAX_NOTIFS);
  return { dados: { ...d, txs, notifs }, novas };
}

/**
 * Reprocessa notificações já registradas (depois de criar/ajustar regras). A transação que veio só
 * dela é refeita mantendo id, tipo e categoria que você escolheu; se ela já tinha sido unida a um
 * extrato, só a ligação com a notificação é refeita.
 */
export function reprocessar(d: Dados, ids: string[]): Dados {
  let txs = d.txs;
  const notifs = d.notifs.map(n => {
    if (!ids.includes(n.id)) return n;
    const antiga = txs.find(t => t.origens.some(o => o.tipo === 'notificacao' && o.ref === n.id));
    let manter: Partial<Transacao> | null = null;
    if (antiga) {
      const resto = antiga.origens.filter(o => !(o.tipo === 'notificacao' && o.ref === n.id));
      if (resto.length) txs = txs.map(t => (t === antiga ? { ...t, origens: resto } : t));
      else {
        txs = txs.filter(t => t !== antiga);
        manter = { id: antiga.id, criadoEm: antiga.criadoEm, ...(antiga.tipoUsuario ? { tipoUsuario: antiga.tipoUsuario } : {}),
          ...(antiga.cat ? { cat: antiga.cat } : {}), ...(antiga.nota ? { nota: antiga.nota } : {}) };
      }
    }
    const r = aplicarNotif({ txs, regras: d.regras, contas: d.contas, filtro: d.config.filtroNotif }, n);
    txs = r.txs;
    if (manter && r.notif.tx && r.notif.status === 'transacao') {
      const novoId = r.notif.tx;
      const criada = txs.find(t => t.id === novoId);
      if (criada && criada.origens.length === 1) {
        txs = txs.map(t => (t === criada ? { ...t, ...manter } : t));
        return { ...r.notif, tx: manter.id };
      }
    }
    return r.notif;
  });
  return { ...d, txs, notifs };
}
