import { describe, expect, it } from 'vitest';
import type { Classificada } from '../src/core/classificar';
import { acumulado, formaPagamento, lugares, maioresGastos, porConta, porDiaSemana, porForma, ritmo } from '../src/core/indicadores';
import { CONTAS_INICIAIS } from '../src/core/padroes';
import type { TipoTx } from '../src/core/tipos';

let seq = 0;
const tx = (conta: string, data: string, valor: number, desc: string, t: TipoTx = valor < 0 ? 'saida' : 'entrada'): Classificada =>
  ({ id: `t${++seq}`, conta, data, desc, valor, origens: [], criadoEm: '', t, c: '', auto: true });
const contas = CONTAS_INICIAIS;
const c = (id: string) => contas.find(x => x.id === id);

describe('formaPagamento', () => {
  it('cartão é crédito; conta de vale é vale', () => {
    expect(formaPagamento({ desc: 'Padaria' }, c('nubank-cartao'))).toBe('credito');
    expect(formaPagamento({ desc: 'CAFE EXEMPLO' }, c('flash'))).toBe('vale');
  });
  it('na conta, pela descrição', () => {
    const mp = c('mercadopago-conta');
    expect(formaPagamento({ desc: 'Pix para Fulano' }, mp)).toBe('pix');
    expect(formaPagamento({ desc: 'Pagamento com QR Pix Padaria' }, mp)).toBe('pix');
    expect(formaPagamento({ desc: 'Pagamento de boleto' }, mp)).toBe('boleto');
    expect(formaPagamento({ desc: 'Saque 24h' }, mp)).toBe('saque');
    expect(formaPagamento({ desc: 'Transferência enviada TED' }, mp)).toBe('transferencia');
    expect(formaPagamento({ desc: 'Mercado Livre' }, mp)).toBe('debito');
    // A descrição de outra origem (ex.: notificação) também conta.
    expect(formaPagamento({ desc: 'Fulano', origens: [{ desc: 'Pix para Fulano' }] }, mp)).toBe('pix');
  });
});

describe('agrupamentos do mês', () => {
  const cls = [
    tx('nubank-cartao', '2026-10-02', -100, 'Loja A'),
    tx('nubank-cartao', '2026-10-03', 20, 'Estorno Loja A', 'saida'), // estorno desconta
    tx('mercadopago-conta', '2026-10-04', -50, 'Pix para Fulano'),
    tx('flash', '2026-10-04', -30, 'CAFE EXEMPLO 123'),
    tx('flash', '2026-10-11', -10, 'CAFE EXEMPLO 456'),
    tx('mercadopago-conta', '2026-10-05', 3000, 'Salário'),
    tx('mercadopago-conta', '2026-10-06', -500, 'Dinheiro reservado', 'caixinha'),
    tx('mercadopago-conta', '2026-09-03', -40, 'Pix para Beltrano'),
  ];
  it('por forma e por conta, sem entradas nem caixinha', () => {
    expect(porForma(cls, contas, '2026-10').map(f => [f.chave, f.v])).toEqual([['credito', 80], ['pix', 50], ['vale', 40]]);
    expect(porConta(cls, '2026-10').map(f => [f.chave, f.v, f.n])).toEqual([['nubank-cartao', 80, 2], ['mercadopago-conta', 50, 1], ['flash', 40, 2]]);
  });
  it('acumulado e ritmo comparado ao mês anterior até o mesmo dia', () => {
    const ac = acumulado(cls, '2026-10');
    expect(ac.length).toBe(31);
    expect(ac[0]).toBe(0);
    expect(ac[3]).toBe(160);
    expect(ac[30]).toBe(170);
    const r = ritmo(cls, '2026-10', '2026-10-10');
    expect(r).toMatchObject({ dias: 10, total: 160, porDia: 16, anterior: 40 });
    expect(r.projecao).toBeCloseTo(16 * 31);
    expect(r.variacao).toBeCloseTo(3);
    // Mês fechado: sem projeção, conta o mês inteiro.
    expect(ritmo(cls, '2026-09', '2026-10-10')).toMatchObject({ dias: 30, total: 40, projecao: null, variacao: null });
  });
  it('dias da semana, maiores gastos e lugares', () => {
    const s = porDiaSemana(cls, '2026-10');
    expect(s[5]).toBe(100); // 02/10/2026 é sexta
    expect(s[0]).toBe(90);  // domingos 04/10 (Pix + Flash) e 11/10
    expect(maioresGastos(cls, '2026-10', 2).map(x => x.valor)).toEqual([-100, -50]);
    const l = lugares(cls, '2026-10');
    expect(l.find(x => x.termo === 'cafe exemplo')).toMatchObject({ v: 40, n: 2 });
  });
});
