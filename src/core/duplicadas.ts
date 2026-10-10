// Avisos de coisa repetida antes de gravar: arquivo já importado, linhas iguais às de outro extrato
// e transação lançada à mão igual (ou quase) a uma que já existe.
import type { EstadoJuntar } from './juntar';
import type { Importacao, LinhaExtrato, Transacao } from './tipos';
import { diasEntre, norm } from './util';

export interface AvisoImportacao {
  total: number;              // linhas que seriam importadas
  conhecidas: number;         // já importadas antes (vão ser puladas)
  mesma: Importacao | null;   // importação anterior igual (todas as linhas já conhecidas, mesma conta e período)
  iguais: number;             // linhas novas iguais (conta, data e valor) a transações de outro extrato
}

/** Confere as linhas contra o que já está no app, sem gravar nada. */
export function checarImportacao(est: EstadoJuntar & { importacoes: Importacao[] }, linhas: LinhaExtrato[], arquivo = ''): AvisoImportacao {
  const conhecidasSet = new Set<string>(est.excluidas);
  for (const t of est.txs) for (const o of t.origens) if (o.tipo === 'extrato') conhecidasSet.add(o.ref);
  for (const r of est.revisoes) conhecidasSet.add(r.linha.chave);
  const novas = linhas.filter(l => !conhecidasSet.has(l.chave));
  const conhecidas = linhas.length - novas.length;
  let mesma: Importacao | null = null;
  if (linhas.length && !novas.length) {
    const datas = linhas.map(l => l.data).sort();
    const de = datas[0], ate = datas[datas.length - 1], conta = linhas[0].conta;
    const iguais = est.importacoes.filter(i => i.conta === conta && i.de === de && i.ate === ate);
    mesma = iguais.find(i => i.arquivo === arquivo) || iguais[iguais.length - 1] || null;
  }
  // Mesmo movimento vindo de outro arquivo (ex.: o extrato em PDF e depois em CSV): chaves diferentes.
  const doExtrato = est.txs.filter(t => t.origens.some(o => o.tipo === 'extrato'));
  const iguais = novas.filter(l => doExtrato.some(t => t.conta === l.conta && t.data === l.data && Math.abs(t.valor - l.valor) < 0.005)).length;
  return { total: linhas.length, conhecidas, mesma, iguais };
}

/** Há algo para avisar? */
export const temAviso = (a: AvisoImportacao) => a.conhecidas > 0 || a.iguais > 0;

/**
 * Transação igual a uma nova: "exata" = mesma conta, data, valor e descrição; senão, "parecida" =
 * mesma conta e valor com até 1 dia de diferença.
 */
export function transacaoIgual(txs: Transacao[], t: Pick<Transacao, 'id' | 'conta' | 'data' | 'valor' | 'desc'>): { tx: Transacao; exata: boolean } | null {
  const mesmas = txs.filter(x => x.id !== t.id && x.conta === t.conta && Math.abs(x.valor - t.valor) < 0.005);
  const d = norm(t.desc).trim();
  const exata = mesmas.find(x => x.data === t.data && norm(x.desc).trim() === d);
  if (exata) return { tx: exata, exata: true };
  const perto = mesmas.filter(x => diasEntre(x.data, t.data) <= 1).sort((a, b) => diasEntre(a.data, t.data) - diasEntre(b.data, t.data));
  return perto.length ? { tx: perto[0], exata: false } : null;
}
