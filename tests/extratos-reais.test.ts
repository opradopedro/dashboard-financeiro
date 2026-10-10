// Formatos reais (enviados pelo usuário), com valores e nomes trocados.
import { describe, expect, it } from 'vitest';
import { lerCsv } from '../src/importar/csv';
import { aplicarMapeamento, sugerirMapeamento } from '../src/importar/mapear';
import { decodificar } from '../src/importar/texto';
import { lerExtratoPdf, type ItemTexto } from '../src/importar/pdf';
import { chavesDasLinhas, importarLinhas, saldoMaisRecente } from '../src/core/juntar';
import { classificar, ehTitular, resumoMes } from '../src/core/classificar';
import { CATEGORIAS_INICIAIS, CONTAS_INICIAIS } from '../src/core/padroes';

const csv = (s: string) => lerCsv(decodificar(new TextEncoder().encode(s)));

describe('Nubank: fatura CSV (date,title,amount)', () => {
  const rows = csv('date,title,amount\n2026-10-09,Padaria,"5,18"\n2026-10-05,Pagamento recebido,"- 804,18"\n2026-10-01,IOF de compra internacional,"3,97"\n2026-09-26,Curso - Parcela 11/12,"148,75"\n2026-09-23,Uber - NuPay,"- 47,94"\n2026-09-23,Uber - NuPay,"47,94"\n');
  it('colunas e sinal (compras positivas no arquivo)', () => {
    const m = sugerirMapeamento(rows);
    expect(m).toMatchObject({ linhaCab: 0, colData: 0, colDesc: 1, colValor: 2 });
    const l = aplicarMapeamento(rows, { ...m, inverter: true }).linhas;
    expect(l.map(x => x.valor)).toEqual([-5.18, 804.18, -3.97, -148.75, 47.94, -47.94]);
    const cls = classificar(chavesDasLinhas('nubank-cartao', l).map((x, i) => ({ id: 't' + i, conta: x.conta, data: x.data, desc: x.desc, valor: x.valor, origens: [], criadoEm: '' })),
      { contas: CONTAS_INICIAIS, categorias: CATEGORIAS_INICIAIS, regrasCat: [] });
    expect(cls.find(x => x.desc === 'Pagamento recebido')!.t).toBe('fatura');
    expect(cls.find(x => x.desc.startsWith('IOF'))!.c).toBe('Taxas e juros');
    expect(resumoMes(cls, '2026-09').saidas).toBeCloseTo(148.75); // estorno do Uber anula a compra
  });
});

describe('Rico (XP): fatura CSV com Portador e Parcela', () => {
  const texto = '﻿Data;Estabelecimento;Portador;Valor;Parcela\n02/08/2026;Pagamento de fatura;FULANO;R$ -560,42; de 1\n13/08/2026;SUPERMERCADO;FULANO;R$ 130,81;-\n14/08/2026;LOJA PARCELADA;FULANO;R$ 50,00;2 de 3\n';
  it('parcela entra na descrição; "-" e "de 1" não', () => {
    const rows = csv(texto);
    const m = sugerirMapeamento(rows);
    expect(m).toMatchObject({ colData: 0, colDesc: 1, colValor: 3, colDesc2: 4 });
    const l = aplicarMapeamento(rows, { ...m, inverter: true }).linhas;
    expect(l.map(x => [x.desc, x.valor])).toEqual([['Pagamento de fatura', 560.42], ['SUPERMERCADO', -130.81], ['LOJA PARCELADA - 2 de 3', -50]]);
  });
  it('a mesma compra em outra parcela não é tratada como repetida', () => {
    const a = chavesDasLinhas('rico-cartao', [{ data: '2026-08-14', desc: 'LOJA PARCELADA - 2 de 3', valor: -50 }]);
    const b = chavesDasLinhas('rico-cartao', [{ data: '2026-08-14', desc: 'LOJA PARCELADA - 3 de 3', valor: -50 }]);
    const r = importarLinhas(importarLinhas({ txs: [], revisoes: [], excluidas: [] }, a, 'set.csv'), b, 'out.csv');
    expect(r.txs).toHaveLength(2);
  });
});

describe('Flash: extrato CSV com saldo', () => {
  const rows = csv('Data,Hora,Movimentação,Valor,Meio de Pagamento,Saldo\n09/10/2026,13:41,CAFE CENTRO BRA,"-R$ 32,00",Cartão,"R$ 941,31"\n08/10/2026,13:12,CAFE CENTRO BRA,"-R$ 32,00",Cartão,"R$ 973,31"\n01/10/2026,08:00,Depósito transferido,"R$ 887,00",Depósito,"R$ 1.005,31"\n');
  it('colunas, saldo e saldo mais recente', () => {
    const m = sugerirMapeamento(rows);
    expect(m).toMatchObject({ colData: 0, colDesc: 2, colValor: 3, colSaldo: 5 });
    const l = aplicarMapeamento(rows, m).linhas;
    expect(l.map(x => x.valor)).toEqual([-32, -32, 887]);
    expect(saldoMaisRecente(l)).toEqual({ data: '2026-10-09', valor: 941.31 });
  });
});

describe('Mercado Pago: extrato em PDF', () => {
  // Texto posicionado como o pdf.js devolve (x, y), imitando o layout do "EXTRATO DE CONTA".
  const i = (pagina: number, y: number, x: number, texto: string): ItemTexto => ({ pagina, x, y, texto });
  const itens: ItemTexto[] = [
    i(1, 760, 300, 'EXTRATO DE CONTA'), i(1, 740, 300, 'Mercado Pago'), i(1, 700, 41, 'Saldo inicial: R$ 450,03'),
    i(1, 584, 41, 'Data'), i(1, 584, 89, 'Descrição'), i(1, 584, 197, 'ID da operação'), i(1, 584, 312, 'Valor'), i(1, 584, 384, 'Saldo'),
    i(1, 560, 41, '01-09-2026'), i(1, 560, 89, 'Rendimentos'), i(1, 560, 197, '1749262932429'), i(1, 560, 307, 'R$ 0,21'), i(1, 560, 372, 'R$ 450,24'),
    i(1, 532, 89, 'Pagamento com QR Pix'), i(1, 520, 41, '01-09-2026'), i(1, 520, 89, 'POSTO CENTRAL'), i(1, 520, 197, '176743067548'),
    i(1, 520, 299, 'R$ -25,00'), i(1, 520, 370, 'R$ 425,24'), i(1, 509, 89, 'LTDA'),
    i(1, 100, 89, 'Reserva por gastos'), i(1, 13, 398, '1/2'),
    i(2, 584, 41, 'Data'), i(2, 584, 89, 'Descrição'), i(2, 584, 197, 'ID da operação'), i(2, 584, 312, 'Valor'), i(2, 584, 384, 'Saldo'),
    i(2, 560, 41, '02-09-2026'), i(2, 560, 197, '176744641546'), i(2, 560, 306, 'R$ -1,00'), i(2, 560, 372, 'R$ 424,24'), i(2, 558, 89, 'Emergência'),
    i(2, 520, 89, 'Pix recebido FULANO'), i(2, 519, 41, '03-09-2026'), i(2, 519, 197, '178851679655'), i(2, 519, 300, 'R$ 1.500,00'), i(2, 519, 372, 'R$ 1.924,24'),
  ];
  const r = lerExtratoPdf(itens);
  it('monta as linhas com descrição em várias linhas, ID e saldo', () => {
    expect(r.banco).toBe('Mercado Pago');
    expect(r.linhas).toEqual([
      { data: '2026-09-01', valor: 0.21, desc: 'Rendimentos', id: '1749262932429', saldo: 450.24 },
      { data: '2026-09-01', valor: -25, desc: 'Pagamento com QR Pix POSTO CENTRAL LTDA', id: '176743067548', saldo: 425.24 },
      { data: '2026-09-02', valor: -1, desc: 'Reserva por gastos Emergência', id: '176744641546', saldo: 424.24 },
      { data: '2026-09-03', valor: 1500, desc: 'Pix recebido FULANO', id: '178851679655', saldo: 1924.24 },
    ]);
    expect(saldoMaisRecente(r.linhas)).toEqual({ data: '2026-09-03', valor: 1924.24 });
  });
  it('"Reserva por gastos" é caixinha; rendimento é entrada', () => {
    const cls = classificar(r.linhas.map((x, k) => ({ id: 'p' + k, conta: 'mercadopago-conta', data: x.data, desc: x.desc, valor: x.valor, origens: [], criadoEm: '' })),
      { contas: CONTAS_INICIAIS, categorias: CATEGORIAS_INICIAIS, regrasCat: [] });
    expect(cls.map(x => x.t)).toEqual(['entrada', 'saida', 'caixinha', 'entrada']);
    expect(cls[0].c).toBe('Rendimentos');
  });
  it('PDF sem a tabela dá erro claro', () => {
    expect(() => lerExtratoPdf([i(1, 500, 10, 'Outro documento')])).toThrow(/tabela/);
  });
});

describe('Pix para você mesmo (nome do titular)', () => {
  it.each([
    ['Pix recebido FULANO DE TAL SILVA', 'Fulano de Tal Silva', true],
    ['Pix enviado Fulano Silva', 'Fulano de Tal Silva', false],
    ['Pix recebido FULANO DE TAL SILVA', '', false],
    ['Compra FULANO DE TAL SILVA', 'Fulano de Tal Silva', false],
  ])('%s / %s → %s', (d, t, r) => expect(ehTitular(d, t)).toBe(r));
  it('o que chega no seu nome é salário; o que sai para você mesmo não conta', () => {
    const cls = classificar([
      { id: 'a', conta: 'mercadopago-conta', data: '2026-09-25', desc: 'Pix recebido FULANO DE TAL SILVA', valor: 620, origens: [], criadoEm: '' },
      { id: 'b', conta: 'mercadopago-conta', data: '2026-09-26', desc: 'Pix enviado Fulano de Tal Silva', valor: -300, origens: [], criadoEm: '' }],
      { contas: CONTAS_INICIAIS, categorias: CATEGORIAS_INICIAIS, regrasCat: [], titular: 'Fulano de Tal Silva' });
    expect(cls.map(x => x.t)).toEqual(['entrada', 'interna']);
    expect(cls[0].c).toBe('Salário');
  });
});
