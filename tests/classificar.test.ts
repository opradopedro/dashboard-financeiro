import { describe, expect, it } from 'vitest';
import { classificar, indicePalavras, resumoMes, saldoEstimado, serieMeses, SEM_CATEGORIA } from '../src/core/classificar';
import { CATEGORIAS_INICIAIS } from '../src/core/padroes';
import type { Conta, Transacao } from '../src/core/tipos';
import { termoDe } from '../src/core/util';

const contas: Conta[] = [
  { id: 'mp', nome: 'MP conta', banco: 'Mercado Pago', tipo: 'corrente', ativa: true },
  { id: 'mpc', nome: 'MP crédito', banco: 'Mercado Pago', tipo: 'cartao', ativa: true },
  { id: 'nu', nome: 'Nubank conta', banco: 'Nubank', tipo: 'corrente', ativa: true },
];
let n = 0;
const tx = (conta: string, data: string, desc: string, valor: number, extra: Partial<Transacao> = {}): Transacao =>
  ({ id: 't' + ++n, conta, data, desc, valor, origens: [], criadoEm: '', ...extra });

// Mesmo cenário do carteira: compras no crédito vão para a caixinha e voltam para pagar a fatura.
const txs = [
  tx('mp', '2026-09-05', 'Pix recebido de EMPRESA LTDA', 2000),
  tx('mpc', '2026-09-06', 'IFOOD *RESTAURANTE', -300),
  tx('mp', '2026-09-06', 'Dinheiro reservado', -300),
  tx('mpc', '2026-09-08', 'SUPERMERCADO BH', -500),
  tx('mp', '2026-09-08', 'Dinheiro reservado', -500),
  tx('mpc', '2026-09-10', 'Estorno SUPERMERCADO BH', 50),
  tx('mp', '2026-09-20', 'Dinheiro retirado', 800),
  tx('mp', '2026-09-20', 'Pagamento de fatura', -800),
  tx('mpc', '2026-09-20', 'Pagamento recebido', 800),
  tx('nu', '2026-09-12', 'Transferência enviada pelo Pix', -1000),
  tx('mp', '2026-09-12', 'Pix recebido', 1000),
  tx('mp', '2026-09-15', 'Rendimentos', 3.21),
  tx('mp', '2026-09-25', 'Pix enviado JOAO', -100),
  tx('mp', '2026-09-26', 'Compra loja sem nome conhecido', -10),
];
const ctx = { contas, categorias: CATEGORIAS_INICIAIS, regrasCat: [] };

describe('entradas e saídas de verdade', () => {
  const cls = classificar(txs, ctx);
  const tipos = (desc: string) => cls.filter(x => x.desc === desc).map(x => x.t);
  it('caixinha, fatura e transferência entre contas suas não contam', () => {
    expect(tipos('Dinheiro reservado')).toEqual(['caixinha', 'caixinha']);
    expect(tipos('Dinheiro retirado')).toEqual(['caixinha']);
    expect(tipos('Pagamento de fatura')).toEqual(['fatura']);
    expect(tipos('Pagamento recebido')).toEqual(['fatura']);
    expect(tipos('Transferência enviada pelo Pix')).toEqual(['interna']);
    expect(tipos('Pix recebido')).toEqual(['interna']);
  });
  it('compra no crédito conta como saída na data da compra; estorno desconta', () => {
    const r = resumoMes(cls, '2026-09');
    expect(r.entradas).toBeCloseTo(2003.21);
    expect(r.saidas).toBeCloseTo(300 + 500 - 50 + 100 + 10);
    expect(r.porCategoria.map(c => c.cat)).toEqual(['Mercado', 'Alimentação', 'Transferências', SEM_CATEGORIA]);
    expect(r.porCategoria[0].v).toBeCloseTo(450);
    expect(r.semCategoria).toBe(2); // a compra sem nome conhecido e o Pix da empresa
    expect(r.fora.caixinha).toBeCloseTo(1600);
    expect(r.entradasPorCategoria.map(c => c.cat)).toEqual([SEM_CATEGORIA, 'Rendimentos']);
  });
  it('tipo da regra de notificação e escolha sua vencem o automático', () => {
    const c2 = classificar([tx('mp', '2026-09-01', 'Dinheiro reservado', -5, { tipo: 'saida' }), tx('mp', '2026-09-01', 'X', -5, { tipoUsuario: 'caixinha', cat: 'Lazer' })], ctx);
    expect(c2.map(x => x.t)).toEqual(['saida', 'caixinha']);
    expect(c2[1].c).toBe('Lazer');
  });
  it('regra de categoria (aplicar às parecidas)', () => {
    const regra = { id: 'r', termo: termoDe('Pix enviado JOAO'), cat: 'Moradia', tipo: 'saida' as const };
    const c2 = classificar(txs, { ...ctx, regrasCat: [regra] });
    expect(c2.find(x => x.desc === 'Pix enviado JOAO')!.c).toBe('Moradia');
    expect(termoDe('PIX ENVIADO 12/09 JOAO 123456')).toBe('pix enviado joao');
  });
  it('série mensal', () => {
    const s = serieMeses(cls, '2026-09', 3);
    expect(s.map(x => x.mes)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(s[2].entradas).toBeCloseTo(2003.21);
  });
});

describe('categorias por palavras (editáveis)', () => {
  const cat = indicePalavras(CATEGORIAS_INICIAIS);
  it.each([
    ['UBER *TRIP', 'Transporte'], ['MERCADOLIVRE*LOJA', 'Compras'], ['Mercado Livre', 'Compras'], ['Supermercado Dia', 'Mercado'],
    ['DROGASIL 123', 'Saúde'], ['NETFLIX.COM', 'Assinaturas'], ['Amazon Prime', 'Assinaturas'], ['Amazon', 'Compras'],
    ['Posto Combustivel', 'Transporte'], ['Pagamento das contas', null],
  ])('%s → %s', (d, c) => expect(cat(d, false)).toBe(c));
  it('entrada só cai em categoria de receita', () => {
    expect(cat('Salario empresa', true)).toBe('Salário');
    expect(cat('IFOOD', true)).toBeNull();
  });
  it('palavra nova vale na hora', () => {
    expect(indicePalavras([{ nome: 'Pet', receita: false, palavras: ['petz', 'cobasi'] }])('COBASI SP', false)).toBe('Pet');
  });
});

describe('saldo estimado', () => {
  it('saldo informado + transações depois da data', () => {
    const c = { ...contas[0], saldoRef: { valor: 100, data: '2026-09-10' } };
    expect(saldoEstimado(txs, c)).toBeCloseTo(100 + 800 - 800 + 1000 + 3.21 - 100 - 10);
    expect(saldoEstimado(txs, contas[0])).toBeNull();
  });
});

describe('pagamento da fatura ligado ao Pix que pagou', () => {
  const cs: Conta[] = [...contas, { id: 'rico', nome: 'Rico crédito', banco: 'Rico', tipo: 'cartao', ativa: true }];
  const c = { ...ctx, contas: cs };
  it('Pix da conta dias antes, mesmo valor, vira pagamento de fatura e fica ligado ao pagamento no cartão', () => {
    const ts = [
      tx('mp', '2026-08-25', 'Pix enviado Fulano de Tal', -586.65),
      tx('rico', '2026-08-31', 'Pagamento de fatura', 586.65),
      tx('rico', '2026-08-20', 'FARMACIA', -34.89),
      tx('mp', '2026-08-30', 'Pix enviado Beltrano', -586.65), // mesmo valor, mais perto do pagamento
    ];
    const cls = classificar(ts, c);
    const [pix, pag, , outro] = cls;
    // O mais perto da data é o de 30/08; os dois têm o mesmo valor, nenhum cita o banco.
    expect(outro.t).toBe('fatura');
    expect(outro.par).toBe(pag.id);
    expect(pag.par).toBe(outro.id);
    expect(pix.t).toBe('saida');
    expect(resumoMes(cls, '2026-08').saidas).toBeCloseTo(586.65 + 34.89);
  });
  it('prefere o Pix que cita o banco do cartão; pagamento com sinal trocado também casa', () => {
    const ts = [
      tx('mp', '2026-08-25', 'Pix enviado Rico Corretora', -586.65),
      tx('mp', '2026-08-30', 'Pix enviado Beltrano', -586.65),
      tx('rico', '2026-08-31', 'Pagamento de fatura', -586.65),
    ];
    const cls = classificar(ts, c);
    expect(cls.map(x => x.t)).toEqual(['fatura', 'saida', 'fatura']);
    expect(cls[0].par).toBe(cls[2].id);
  });
  it('fora da janela ou valor diferente: não liga', () => {
    const ts = [tx('mp', '2026-08-01', 'Pix enviado X', -586.65), tx('mp', '2026-08-28', 'Pix enviado Y', -500), tx('rico', '2026-08-31', 'Pagamento de fatura', 586.65)];
    const cls = classificar(ts, c);
    expect(cls.map(x => x.t)).toEqual(['saida', 'saida', 'fatura']);
    expect(cls[2].par).toBeUndefined();
  });
});
