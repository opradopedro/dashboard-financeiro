import { describe, expect, it } from 'vitest';
import { exportarFinai, lerFinai, linhasFinai, FORMATO } from '../src/core/finai';
import { CONTAS_INICIAIS } from '../src/core/padroes';
import { importarLinhas, type EstadoJuntar } from '../src/core/juntar';
import type { Transacao } from '../src/core/tipos';

const txs: Transacao[] = [
  { id: 't1', conta: 'mercadopago-conta', data: '2026-10-08', desc: 'Dinheiro reservado', valor: -300, tipo: 'caixinha', cat: 'X', origens: [], criadoEm: '' },
  { id: 't2', conta: 'nubank-cartao', data: '2026-10-07', desc: 'IFOOD', valor: -30, origens: [], criadoEm: '' },
];

describe('exportação finai-banco/1', () => {
  const arq = exportarFinai(CONTAS_INICIAIS, txs, {}, new Date(2026, 9, 9, 9, 0, 0));
  it('tem exatamente os campos do formato', () => {
    expect(Object.keys(arq)).toEqual(['formato', 'geradoEm', 'contas', 'transacoes']);
    expect(arq.formato).toBe(FORMATO);
    expect(arq.geradoEm).toMatch(/^2026-10-09T09:00:00[+-]\d{2}:\d{2}$/);
    expect(Object.keys(arq.contas[0])).toEqual(['id', 'banco', 'nome', 'tipo', 'saldo']);
    expect(arq.contas.map(c => c.tipo)).toEqual(['corrente', 'cartao', 'cartao', 'cartao', 'corrente']);
    expect(Object.keys(arq.transacoes[0])).toEqual(['conta', 'data', 'descricao', 'valor', 'id']);
    expect(arq.transacoes.map(t => t.data)).toEqual(['2026-10-07', '2026-10-08']); // em ordem de data
  });
  it('filtro por período', () => {
    expect(exportarFinai(CONTAS_INICIAIS, txs, { de: '2026-10-08' }).transacoes).toHaveLength(1);
  });
  it('ida e volta: ler o arquivo exportado e reimportar não duplica', () => {
    const lido = lerFinai(JSON.stringify(arq));
    expect(lido.contas.map(c => c.id)).toEqual(CONTAS_INICIAIS.map(c => c.id));
    let est: EstadoJuntar = { txs: [], revisoes: [], excluidas: [] };
    for (const [conta, l] of lido.porConta) est = importarLinhas(est, linhasFinai(conta, l), 'a.json');
    expect(est.txs).toHaveLength(2);
    for (const [conta, l] of lido.porConta) expect(importarLinhas(est, linhasFinai(conta, l), 'a.json').importacao.novas).toBe(0);
  });
  it('lê o exemplo do carteira (valor como texto, sem id)', () => {
    const l = lerFinai(JSON.stringify({ formato: 'finai-banco/1', geradoEm: '2026-10-09T07:00:00-03:00',
      contas: [{ id: 'nubank-cartao', banco: 'Nubank', nome: 'Cartão', tipo: 'cartao', saldo: 50 }],
      transacoes: [{ conta: 'nubank-cartao', data: '2026-10-08', descricao: 'UBER *TRIP', valor: '-25,90' }, { conta: 'x', data: 'ruim', valor: 1 }] }));
    expect(l.porConta.get('nubank-cartao')).toEqual([{ data: '2026-10-08', desc: 'UBER *TRIP', valor: -25.9 }]);
    expect(l.avisos).toHaveLength(1);
    expect(() => lerFinai('{}')).toThrow();
  });
});
