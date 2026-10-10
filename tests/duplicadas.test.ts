import { describe, expect, it } from 'vitest';
import { checarImportacao, temAviso, transacaoIgual } from '../src/core/duplicadas';
import { chavesDasLinhas, importarLinhas } from '../src/core/juntar';
import type { Transacao } from '../src/core/tipos';

const brutas = [
  { data: '2026-09-01', desc: 'Padaria', valor: -10 },
  { data: '2026-09-02', desc: 'Mercado', valor: -50 },
];
const vazio = { txs: [] as Transacao[], revisoes: [], excluidas: [], importacoes: [] };

describe('arquivo repetido', () => {
  const ls = chavesDasLinhas('c', brutas);
  const a = importarLinhas(vazio, ls, 'extrato.csv', '2026-10-10T00:00:00Z');
  const depois = { ...a, importacoes: [a.importacao] };

  it('primeira vez: nada a avisar', () => {
    expect(temAviso(checarImportacao(vazio, ls, 'extrato.csv'))).toBe(false);
  });
  it('o mesmo arquivo de novo: todas conhecidas e a importação anterior', () => {
    const r = checarImportacao(depois, ls, 'extrato.csv');
    expect(r).toMatchObject({ total: 2, conhecidas: 2, iguais: 0 });
    expect(r.mesma?.id).toBe(a.importacao.id);
  });
  it('arquivo maior que inclui o anterior: só parte conhecida, sem "mesma"', () => {
    const r = checarImportacao(depois, chavesDasLinhas('c', [...brutas, { data: '2026-09-03', desc: 'Farmácia', valor: -20 }]), 'outro.csv');
    expect(r).toMatchObject({ total: 3, conhecidas: 2, mesma: null });
  });
  it('mesmo movimento vindo de outro formato (chave diferente): conta como igual', () => {
    const outroFormato = chavesDasLinhas('c', brutas.map(b => ({ ...b, desc: b.desc.toUpperCase() + ' LTDA', id: 'x' + b.valor })));
    const r = checarImportacao(depois, outroFormato, 'extrato.pdf');
    expect(r).toMatchObject({ conhecidas: 0, iguais: 2 });
    expect(temAviso(r)).toBe(true);
  });
});

describe('transação lançada à mão', () => {
  const tx = (id: string, data: string, desc: string, valor: number, conta = 'c'): Transacao => ({ id, conta, data, desc, valor, origens: [], criadoEm: '' });
  const txs = [tx('a', '2026-09-01', 'Padaria Pão', -10), tx('b', '2026-09-05', 'Uber', -20)];
  it('igual em tudo: exata', () => {
    expect(transacaoIgual(txs, tx('n', '2026-09-01', 'padaria pão', -10))).toMatchObject({ tx: { id: 'a' }, exata: true });
  });
  it('mesmo valor e conta a 1 dia: parecida', () => {
    expect(transacaoIgual(txs, tx('n', '2026-09-06', 'Corrida', -20))).toMatchObject({ tx: { id: 'b' }, exata: false });
  });
  it('outra conta, outro valor ou longe: nada', () => {
    expect(transacaoIgual(txs, tx('n', '2026-09-01', 'Padaria Pão', -10, 'outra'))).toBeNull();
    expect(transacaoIgual(txs, tx('n', '2026-09-01', 'Padaria Pão', -11))).toBeNull();
    expect(transacaoIgual(txs, tx('n', '2026-09-08', 'Uber', -20))).toBeNull();
  });
  it('ao editar, não compara com ela mesma', () => {
    expect(transacaoIgual(txs, tx('a', '2026-09-01', 'Padaria Pão', -10))).toBeNull();
  });
});
