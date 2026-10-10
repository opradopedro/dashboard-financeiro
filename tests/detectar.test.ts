import { describe, expect, it } from 'vitest';
import { contaDaFonte, detectarFonte } from '../src/importar/detectar';
import { lerCsv } from '../src/importar/csv';
import { lerOfx } from '../src/importar/ofx';
import { assinatura } from '../src/importar/mapear';
import { CONTAS_INICIAIS } from '../src/core/padroes';
import type { Conta, ModeloImport } from '../src/core/tipos';

// Cabeçalhos iguais aos dos arquivos reais (dados trocados).
const NUBANK_FATURA = 'date,title,amount\n2026-10-09,Padaria Exemplo,"5,18"\n2026-09-23,Uber - NuPay,"- 47,94"\n';
const NUBANK_CONTA = 'Data,Valor,Identificador,Descrição\n01/10/2026,-50.00,abc-123,Transferência enviada pelo Pix - Fulano\n';
const RICO_FATURA = '﻿Data;Estabelecimento;Portador;Valor;Parcela\n18/09/2026;PAPELARIA EXEMPLO;FULANO DE TAL;R$ 114,30;-\n';
const FLASH = 'Data,Hora,Movimentação,Valor,Meio de Pagamento,Saldo\n09/10/2026,13:41,CAFE EXEMPLO,"-R$ 32,00",Cartão,"R$ 941,31"\n';
const GENERICO = 'Data;Histórico;Valor\n01/10/2026;Compra;-10,00\n';

const ofx = (bankId: string, cartao = false, org = '') => `OFXHEADER:100
<OFX><SIGNONMSGSRSV1><SONRS>${org ? `<FI><ORG>${org}</FI>` : ''}</SONRS></SIGNONMSGSRSV1>
${cartao ? '<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>' : '<BANKMSGSRSV1><STMTTRNRS><STMTRS>'}
<BANKACCTFROM><BANKID>${bankId}<ACCTID>123</BANKACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001<TRNAMT>-10.00<FITID>1<MEMO>Compra</STMTTRN></BANKTRANLIST>
</OFX>`;

const ler = (nome: string, csv: string) => ({ nome, rows: lerCsv(csv) });
const ofxLido = (nome: string, texto: string) => { const o = lerOfx(texto); return { nome, ofx: { cartao: o.cartao, banco: o.banco, bankId: o.bankId } }; };

describe('detectarFonte', () => {
  it('reconhece os formatos conhecidos pelo cabeçalho', () => {
    expect(detectarFonte(ler('x.csv', NUBANK_FATURA))).toMatchObject({ banco: 'Nubank', tipo: 'cartao', por: 'formato' });
    expect(detectarFonte(ler('x.csv', NUBANK_CONTA))).toMatchObject({ banco: 'Nubank', tipo: 'corrente' });
    expect(detectarFonte(ler('Fatura2026-10-01.csv', RICO_FATURA))).toMatchObject({ banco: 'Rico', tipo: 'cartao' });
    expect(detectarFonte(ler('extratoflash.csv', FLASH))).toMatchObject({ banco: 'Flash', tipo: 'corrente' });
  });

  it('PDF do Mercado Pago pelo texto', () => {
    expect(detectarFonte({ nome: 'pdf_261009.pdf', textoPdf: 'EXTRATO DE CONTA Mercado Pago Data Descrição ID da operação Valor Saldo' }))
      .toMatchObject({ banco: 'Mercado Pago', tipo: 'corrente' });
  });

  it('OFX pelo código do banco, pelo ORG e pelo tipo (conta ou cartão)', () => {
    expect(detectarFonte(ofxLido('a.ofx', ofx('0260', true)))).toMatchObject({ banco: 'Nubank', tipo: 'cartao' });
    expect(detectarFonte(ofxLido('a.ofx', ofx('323')))).toMatchObject({ banco: 'Mercado Pago', tipo: 'corrente' });
    expect(detectarFonte(ofxLido('a.ofx', ofx('999', false, 'Nu Pagamentos S.A.')))).toMatchObject({ banco: 'Nubank' });
  });

  it('sem formato conhecido, usa o nome do arquivo', () => {
    expect(detectarFonte(ler('Nubank_2026-11-03.csv', GENERICO))).toMatchObject({ banco: 'Nubank', por: 'nome' });
    expect(detectarFonte(ler('fatura-mercado-pago.csv', GENERICO))).toMatchObject({ banco: 'Mercado Pago', tipo: 'cartao' });
    expect(detectarFonte(ler('extrato_itau.csv', GENERICO))).toMatchObject({ banco: 'Itaú', tipo: 'corrente' });
    expect(detectarFonte(ler('planilha.csv', GENERICO))).toBeNull();
    expect(detectarFonte(ler('fabrico.csv', GENERICO))).toBeNull(); // "rico" no meio da palavra não conta
  });

  it('modelo salvo vence o formato e já diz a conta', () => {
    const rows = lerCsv(GENERICO);
    const md: ModeloImport = { id: 'm1', conta: 'itau', nome: 'Itaú conta', assinatura: assinatura(rows, 0), linhaCab: 0, colData: 0, colDesc: 1, colDesc2: -1, colValor: 2, colCredito: -1, colDebito: -1, colSaldo: -1, inverter: false, formatoData: 'auto' };
    expect(detectarFonte({ nome: 'planilha.csv', rows }, [md])).toMatchObject({ por: 'modelo', conta: 'itau' });
    // O mesmo cabeçalho salvo em duas contas diferentes: ambíguo, não usa o modelo.
    expect(detectarFonte({ nome: 'planilha.csv', rows }, [md, { ...md, id: 'm2', conta: 'outra' }])).toBeNull();
  });
});

describe('contaDaFonte', () => {
  const contas: Conta[] = CONTAS_INICIAIS;
  it('escolhe pela instituição e pelo tipo', () => {
    expect(contaDaFonte({ banco: 'Nubank', tipo: 'cartao', rotulo: '', por: 'formato' }, contas)).toBe('nubank-cartao');
    expect(contaDaFonte({ banco: 'Mercado Pago', tipo: 'corrente', rotulo: '', por: 'formato' }, contas)).toBe('mercadopago-conta');
    expect(contaDaFonte({ banco: 'Rico', tipo: 'cartao', rotulo: '', por: 'formato' }, contas)).toBe('rico-cartao');
    expect(contaDaFonte({ banco: 'Flash', tipo: 'corrente', rotulo: '', por: 'formato' }, contas)).toBe('flash');
  });
  it('sem tipo, só escolhe se o banco tiver uma conta só', () => {
    expect(contaDaFonte({ banco: 'Nubank', rotulo: '', por: 'nome' }, contas)).toBe('nubank-cartao');
    expect(contaDaFonte({ banco: 'Mercado Pago', rotulo: '', por: 'nome' }, contas)).toBeNull();
  });
  it('banco sem conta no app, conta inativa ou tipo que não existe', () => {
    expect(contaDaFonte({ banco: 'Itaú', tipo: 'corrente', rotulo: '', por: 'formato' }, contas)).toBeNull();
    expect(contaDaFonte({ banco: 'Nubank', tipo: 'corrente', rotulo: '', por: 'formato' }, contas)).toBeNull();
    expect(contaDaFonte({ banco: 'Nubank', tipo: 'cartao', rotulo: '', por: 'formato' }, contas.map(c => ({ ...c, ativa: false })))).toBeNull();
  });
  it('conta do modelo salvo, se ainda existir', () => {
    expect(contaDaFonte({ banco: '', rotulo: '', por: 'modelo', conta: 'flash' }, contas)).toBe('flash');
    expect(contaDaFonte({ banco: '', rotulo: '', por: 'modelo', conta: 'apagada' }, contas)).toBeNull();
  });
});
