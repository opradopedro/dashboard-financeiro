// Leitor de OFX (1.x em SGML e 2.x em XML): conta, tipo (conta ou cartão) e transações com FITID.
import { parseData, parseValor } from '../core/util';
import type { LinhaBruta } from '../core/juntar';

export interface Ofx { cartao: boolean; contaId: string; banco: string; linhas: LinhaBruta[] }

const tag = (bloco: string, nome: string) => {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
  return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
};

export function lerOfx(texto: string): Ofx {
  if (!/<OFX>/i.test(texto)) throw new Error('Este arquivo não parece um OFX (falta a marca <OFX>).');
  const cartao = /<CCSTMTRS>/i.test(texto);
  const contaId = tag(texto, 'ACCTID');
  const banco = tag(texto, 'ORG') || tag(texto, 'BANKID');
  const linhas: LinhaBruta[] = [];
  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const b = m[1];
    const data = parseData(tag(b, 'DTPOSTED') || tag(b, 'DTUSER'));
    const valor = parseValor(tag(b, 'TRNAMT').replace(',', '.'));
    if (!data || !Number.isFinite(valor)) continue;
    const nome = tag(b, 'NAME'), memo = tag(b, 'MEMO');
    const desc = nome && memo && !memo.includes(nome) ? `${nome} ${memo}` : memo || nome || tag(b, 'TRNTYPE');
    const fitid = tag(b, 'FITID');
    linhas.push({ data, valor, desc, ...(fitid ? { id: fitid } : {}) });
  }
  return { cartao, contaId, banco, linhas };
}
