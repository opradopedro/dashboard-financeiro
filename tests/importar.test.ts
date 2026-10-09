import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { detectarSeparador, lerCsv } from '../src/importar/csv';
import { lerOfx } from '../src/importar/ofx';
import { aplicarMapeamento, assinatura, modeloPara, sugerirMapeamento } from '../src/importar/mapear';
import { lerPlanilha } from '../src/importar/planilha';
import { decodificar } from '../src/importar/texto';
import { parseData, parseValor } from '../src/core/util';

describe('valores e datas', () => {
  it.each([
    ['1.234,56', 1234.56], ['-1.234,56', -1234.56], ['R$ 12,34', 12.34], ['- R$ 5,00', -5], ['(12,34)', -12.34],
    ['12,34-', -12.34], ['1234.56', 1234.56], ['-25.9', -25.9], ['1.234', 1234], ['12,34 D', -12.34], ['12,34 C', 12.34], ['abc', NaN], ['', NaN],
  ])('%s → %s', (s, v) => expect(parseValor(s)).toBe(v));
  it.each([
    ['09/10/2026', '2026-10-09'], ['9/10/26', '2026-10-09'], ['2026-10-09', '2026-10-09'], ['2026-10-09T10:00:00', '2026-10-09'],
    ['20261009120000[-3:BRT]', '2026-10-09'], ['31/02/2026', null], ['ontem', null],
  ])('%s → %s', (s, v) => expect(parseData(s)).toBe(v));
  it('série do Excel e mês/dia', () => {
    expect(parseData(46304)).toBe('2026-10-09');
    expect(parseData('10/09/2026', 'mdy')).toBe('2026-10-09');
  });
});

describe('CSV', () => {
  const csv = 'Data;Descrição;Valor\r\n01/10/2026;"PADARIA; X";-52,00\r\n02/10/2026;Pix recebido;1.500,00\r\n;Saldo do dia;1448,00\r\n';
  it('separador, aspas e mapeamento sugerido', () => {
    expect(detectarSeparador(csv)).toBe(';');
    const rows = lerCsv(csv);
    expect(rows[1]).toEqual(['01/10/2026', 'PADARIA; X', '-52,00']);
    const m = sugerirMapeamento(rows);
    expect(m).toMatchObject({ linhaCab: 0, colData: 0, colDesc: 1, colValor: 2 });
    const r = aplicarMapeamento(rows, m);
    expect(r.linhas).toEqual([{ data: '2026-10-01', desc: 'PADARIA; X', valor: -52 }, { data: '2026-10-02', desc: 'Pix recebido', valor: 1500 }]);
    expect(r.ignoradas).toHaveLength(1);
  });
  it('crédito e débito em colunas separadas; inverter sinal', () => {
    const rows = lerCsv('Data,Histórico,Crédito,Débito\n01/10/2026,Salário,3000.00,\n02/10/2026,Mercado,,120.50\n');
    const m = sugerirMapeamento(rows);
    expect(m).toMatchObject({ colValor: -1, colCredito: 2, colDebito: 3 });
    expect(aplicarMapeamento(rows, m).linhas.map(l => l.valor)).toEqual([3000, -120.5]);
    expect(aplicarMapeamento(rows, { ...m, inverter: true }).linhas.map(l => l.valor)).toEqual([-3000, 120.5]);
  });
  it('sem cabeçalho, pelo conteúdo', () => {
    const rows = lerCsv('2026-10-01,UBER TRIP,-25.90\n2026-10-02,IFOOD,-40.00\n');
    const m = sugerirMapeamento(rows);
    expect(m).toMatchObject({ linhaCab: -1, colData: 0, colDesc: 1, colValor: 2 });
    expect(aplicarMapeamento(rows, m).linhas).toHaveLength(2);
  });
  it('modelo salvo é achado pela assinatura do cabeçalho', () => {
    const rows = lerCsv(csv);
    const md = { ...sugerirMapeamento(rows), id: 'm', conta: 'nu', nome: 'Nubank', assinatura: assinatura(rows, 0) };
    expect(modeloPara([md], 'nu', rows)?.id).toBe('m');
    expect(modeloPara([md], 'mp', rows)).toBeNull();
  });
  it('arquivo em Windows-1252', () => {
    const b = new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]); // "Descrição" em latin1
    expect(decodificar(b)).toBe('Descrição');
  });
});

describe('Excel', () => {
  it('lê xlsx com data como data e valor como número', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Fatura do cartão'], [], ['Data', 'Estabelecimento', 'Valor (R$)'], [new Date(2026, 9, 1), 'UBER *TRIP', 25.9], [new Date(2026, 9, 2), 'Pagamento recebido', -500]], { cellDates: false });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Fatura');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const p = await lerPlanilha(buf);
    expect(p.abas).toEqual(['Fatura']);
    const rows = p.ler('Fatura');
    const m = sugerirMapeamento(rows);
    expect(m).toMatchObject({ linhaCab: 1, colData: 0, colDesc: 1, colValor: 2 }); // linha vazia é pulada
    const r = aplicarMapeamento(rows, { ...m, inverter: true });
    expect(r.linhas).toEqual([{ data: '2026-10-01', desc: 'UBER *TRIP', valor: -25.9 }, { data: '2026-10-02', desc: 'Pagamento recebido', valor: 500 }]);
  });
});

describe('OFX', () => {
  const sgml = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>0323<ACCTID>12345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001120000[-3:BRT]<TRNAMT>-52.00<FITID>abc1<MEMO>PADARIA X
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261002<TRNAMT>1500.00<FITID>abc2<NAME>EMPRESA<MEMO>Pix recebido
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  it('SGML sem fechamento de tags', () => {
    const o = lerOfx(sgml);
    expect(o).toMatchObject({ cartao: false, contaId: '12345' });
    expect(o.linhas).toEqual([
      { data: '2026-10-01', valor: -52, desc: 'PADARIA X', id: 'abc1' },
      { data: '2026-10-02', valor: 1500, desc: 'EMPRESA Pix recebido', id: 'abc2' },
    ]);
  });
  it('XML de cartão', () => {
    const xml = `<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>9999</ACCTID></CCACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003</DTPOSTED><TRNAMT>-25.90</TRNAMT><FITID>x1</FITID><MEMO>UBER &amp; CIA</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const o = lerOfx(xml);
    expect(o.cartao).toBe(true);
    expect(o.linhas).toEqual([{ data: '2026-10-03', valor: -25.9, desc: 'UBER & CIA', id: 'x1' }]);
  });
  it('arquivo que não é OFX', () => expect(() => lerOfx('a;b')).toThrow());
});
