import { describe, expect, it } from 'vitest';
import { chavesDasLinhas, conferencia, importarLinhas, resolverRevisao, type EstadoJuntar, aplicarEdicoes, txsDaImportacao, desfazerImportacoes } from '../src/core/juntar';
import type { Transacao } from '../src/core/tipos';

const tx = (id: string, conta: string, data: string, valor: number, tipo: 'notificacao' | 'manual' = 'notificacao', desc = 'NOTIF'): Transacao =>
  ({ id, conta, data, desc, valor, origens: [{ tipo, ref: 'n-' + id, em: '', data, desc, valor }], criadoEm: '' });
const vazio = (txs: Transacao[] = []): EstadoJuntar => ({ txs, revisoes: [], excluidas: [] });

describe('chaves das linhas', () => {
  it('duas linhas iguais no mesmo dia têm chaves diferentes; FITID vira chave', () => {
    const l = chavesDasLinhas('c', [{ data: '2026-10-01', desc: 'IFOOD', valor: -30 }, { data: '2026-10-01', desc: 'ifood', valor: -30 }, { data: '2026-10-01', desc: 'X', valor: -1, id: 'F1' }]);
    expect(new Set(l.map(x => x.chave)).size).toBe(3);
    expect(l[2].chave).toBe('id:c:F1');
  });
});

describe('importar extrato sem duplicar', () => {
  const linhas = chavesDasLinhas('nu', [
    { data: '2026-10-01', desc: 'PADARIA X', valor: -52 },
    { data: '2026-10-02', desc: 'UBER *TRIP', valor: -25.9 },
    { data: '2026-10-02', desc: 'UBER *TRIP', valor: -25.9 },
  ]);
  it('reimportar o mesmo arquivo não cria nada novo', () => {
    const a = importarLinhas(vazio(), linhas, 'f.csv');
    expect(a.importacao).toMatchObject({ novas: 3, unidas: 0, revisao: 0, repetidas: 0, de: '2026-10-01', ate: '2026-10-02' });
    const b = importarLinhas(a, linhas, 'f.csv');
    expect(b.txs).toHaveLength(3);
    expect(b.importacao).toMatchObject({ novas: 0, repetidas: 3 });
  });
  it('linha que corresponde a notificação (mesma conta, valor, data ±1) é unida; extrato prevalece', () => {
    const notif = tx('a', 'nu', '2026-10-02', -52);
    const r = importarLinhas(vazio([notif]), linhas.slice(0, 1), 'f.csv');
    expect(r.txs).toHaveLength(1);
    expect(r.importacao.unidas).toBe(1);
    expect(r.txs[0]).toMatchObject({ id: 'a', data: '2026-10-01', desc: 'PADARIA X' });
    expect(r.txs[0].origens.map(o => o.tipo)).toEqual(['notificacao', 'extrato']);
    expect(r.txs[0].origens[0].desc).toBe('NOTIF'); // a origem guarda como chegou
  });
  it('outra conta ou outro valor não une', () => {
    const r = importarLinhas(vazio([tx('a', 'mp', '2026-10-01', -52), tx('b', 'nu', '2026-10-01', -52.01)]), linhas.slice(0, 1), 'f');
    expect(r.importacao.novas).toBe(1);
  });
  it('data a 2–3 dias ou mais de um candidato vai para revisão', () => {
    const r1 = importarLinhas(vazio([tx('a', 'nu', '2026-10-04', -52)]), linhas.slice(0, 1), 'f');
    expect(r1.importacao.revisao).toBe(1);
    expect(r1.revisoes[0].candidatos).toEqual(['a']);
    const r2 = importarLinhas(vazio([tx('a', 'nu', '2026-10-01', -52), tx('b', 'nu', '2026-10-01', -52, 'manual')]), linhas.slice(0, 1), 'f');
    expect(r2.importacao.revisao).toBe(1);
    expect(r2.txs).toHaveLength(2);
    // reimportar com revisão pendente não duplica a revisão
    expect(importarLinhas(r2, linhas.slice(0, 1), 'f').revisoes).toHaveLength(1);
  });
  it('resolver revisão: unir ou criar nova', () => {
    const r = importarLinhas(vazio([tx('a', 'nu', '2026-10-04', -52)]), linhas.slice(0, 1), 'f');
    const unida = resolverRevisao(r, r.revisoes[0].id, 'a');
    expect(unida.txs).toHaveLength(1);
    expect(unida.txs[0].origens.map(o => o.tipo)).toEqual(['notificacao', 'extrato']);
    expect(unida.revisoes).toHaveLength(0);
    const nova = resolverRevisao(r, r.revisoes[0].id, null);
    expect(nova.txs).toHaveLength(2);
    // e reimportar depois de resolver continua sem duplicar
    expect(importarLinhas(nova, linhas.slice(0, 1), 'f').importacao.repetidas).toBe(1);
  });
  it('excluída não volta ao reimportar', () => {
    const a = importarLinhas(vazio(), linhas, 'f');
    const sem = { ...a, txs: a.txs.slice(1), excluidas: [a.txs[0].origens[0].ref] };
    expect(importarLinhas(sem, linhas, 'f').txs).toHaveLength(2);
  });
});

describe('conferência mensal', () => {
  it('separa o que bateu, só extrato e só notificação, e o período coberto', () => {
    const l = chavesDasLinhas('nu', [{ data: '2026-10-01', desc: 'A', valor: -10 }, { data: '2026-10-05', desc: 'B', valor: -20 }]);
    const r = importarLinhas(vazio([tx('a', 'nu', '2026-10-01', -10), tx('z', 'nu', '2026-10-09', -99)]), l, 'f');
    const c = conferencia(r.txs, r.revisoes, [r.importacao], 'nu', '2026-10');
    expect(c.bateu.map(t => t.id)).toEqual(['a']);
    expect(c.soExtrato.map(t => t.desc)).toEqual(['B']);
    expect(c.soNotificacao.map(t => t.id)).toEqual(['z']);
    expect(c.periodo).toEqual({ de: '2026-10-01', ate: '2026-10-05' });
  });
});

describe('edições da pré-visualização', () => {
  const brutas = [
    { data: '2026-08-02', desc: 'Pagamento recebido', valor: -1255.5 },
    { data: '2026-08-06', desc: 'Uber', valor: 7.9 },
    { data: '2026-08-10', desc: 'Google Youtube', valor: -16.9 },
  ];
  const ed = { excluir: [1], inverter: [0], cat: { 2: 'Assinaturas' }, tipo: { 0: 'fatura' as const } };

  it('tira, inverte e guarda categoria e tipo; a chave é a da linha original', () => {
    const ls = chavesDasLinhas('nu', brutas);
    const r = aplicarEdicoes(ls, ed);
    expect(r.excluidas).toEqual([ls[1].chave]);
    expect(r.linhas.map(l => [l.valor, l.chave, l.cat, l.tipoUsuario])).toEqual([
      [1255.5, ls[0].chave, undefined, 'fatura'], [-16.9, ls[2].chave, 'Assinaturas', undefined]]);
  });

  it('importar com edições: transação nova leva as escolhas; reimportar não traz nada de volta', () => {
    const ls = chavesDasLinhas('nu', brutas);
    const r = aplicarEdicoes(ls, ed);
    const est = { txs: [], revisoes: [], excluidas: r.excluidas };
    const a = importarLinhas(est, r.linhas, 'fatura.csv', '2026-10-10T00:00:00Z');
    expect(a.txs.map(t => [t.valor, t.tipoUsuario, t.cat])).toEqual([[1255.5, 'fatura', undefined], [-16.9, undefined, 'Assinaturas']]);
    const imp = a.importacao;
    expect(txsDaImportacao(a.txs, imp).length).toBe(2);
    // Mesmo arquivo de novo, sem mexer em nada: tudo repetido (inclusive a linha tirada).
    const b = importarLinhas({ ...a, excluidas: r.excluidas }, chavesDasLinhas('nu', brutas), 'fatura.csv');
    expect(b.importacao).toMatchObject({ novas: 0, repetidas: 3 });
    expect(txsDaImportacao(b.txs, b.importacao)).toEqual([]);
  });
});

describe('desfazer importação', () => {
  it('tira o que veio só do arquivo, devolve a notificação ao que era e permite importar de novo', () => {
    const notif: Transacao = { id: 'n1', conta: 'c', data: '2026-09-01', desc: 'Compra Padaria', valor: -10, origens: [{ tipo: 'notificacao', ref: 'x', em: '', data: '2026-09-01', desc: 'Compra Padaria', valor: -10 }], criadoEm: '' };
    const ls = chavesDasLinhas('c', [{ data: '2026-09-01', desc: 'PADARIA LTDA', valor: -10 }, { data: '2026-09-03', desc: 'Mercado', valor: -50 }]);
    const a = importarLinhas({ txs: [notif], revisoes: [], excluidas: [] }, ls, 'f.csv', '2026-10-10T00:00:00Z');
    expect(a.importacao).toMatchObject({ novas: 1, unidas: 1 });
    const est = { ...a, importacoes: [a.importacao] };
    const d = desfazerImportacoes(est, [a.importacao.id]);
    expect(d).toMatchObject({ removidas: 1, restauradas: 1, importacoes: [] });
    expect(d.txs).toHaveLength(1);
    expect(d.txs[0]).toMatchObject({ id: 'n1', desc: 'Compra Padaria', origens: [{ tipo: 'notificacao' }] });
    // Importar o mesmo arquivo de novo funciona (nada ficou como excluído).
    const b = importarLinhas(d, ls, 'f.csv');
    expect(b.importacao).toMatchObject({ novas: 1, unidas: 1, repetidas: 0 });
  });
  it('outras importações e revisões de outros arquivos ficam', () => {
    const l1 = chavesDasLinhas('c', [{ data: '2026-09-01', desc: 'A', valor: -1 }]);
    const l2 = chavesDasLinhas('c', [{ data: '2026-09-02', desc: 'B', valor: -2 }]);
    const a = importarLinhas({ txs: [], revisoes: [], excluidas: [] }, l1, '1.csv', '2026-10-10T00:00:00Z');
    const b = importarLinhas(a, l2, '2.csv', '2026-10-10T00:00:01Z');
    const d = desfazerImportacoes({ ...b, importacoes: [a.importacao, b.importacao] }, [a.importacao.id]);
    expect(d.txs.map(t => t.desc)).toEqual(['B']);
    expect(d.importacoes.map(i => i.arquivo)).toEqual(['2.csv']);
  });
});
