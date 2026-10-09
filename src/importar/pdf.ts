// Extrato em PDF (ex.: Mercado Pago "EXTRATO DE CONTA"): lê o texto com posição (pdf.js, embutido no
// app) e monta as linhas pela tabela "Data | Descrição | ID da operação | Valor | Saldo".
// A descrição pode ocupar várias linhas acima e abaixo da data: cada pedaço vai para a data mais
// próxima na vertical. O ID da operação vira a chave da linha (reimportar não duplica).
import type { LinhaBruta } from '../core/juntar';
import { norm, parseData, parseValor } from '../core/util';

export interface ItemTexto { pagina: number; x: number; y: number; texto: string }

/** Texto do PDF com posição (y cresce para cima, como no PDF). */
export async function itensPdf(buf: ArrayBuffer): Promise<ItemTexto[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  }
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; }
  catch (e) {
    if ((e as Error)?.name === 'PasswordException') throw new Error('Este PDF pede senha. Baixe o extrato de novo sem senha.');
    throw new Error('Não consegui abrir este PDF.');
  }
  const out: ItemTexto[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items as { str?: string; transform?: number[] }[]) {
      const texto = (it.str || '').trim();
      if (texto && it.transform) out.push({ pagina: p, x: it.transform[4], y: it.transform[5], texto });
    }
  }
  await doc.destroy();
  return out;
}

interface Linha { pagina: number; y: number; itens: ItemTexto[] }

/** Junta itens na mesma altura (tolerância de 2,5 pontos) em linhas, de cima para baixo. */
function linhas(itens: ItemTexto[]): Linha[] {
  const out: Linha[] = [];
  for (const it of [...itens].sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x)) {
    const l = out[out.length - 1];
    if (l && l.pagina === it.pagina && Math.abs(l.y - it.y) <= 2.5) l.itens.push(it);
    else out.push({ pagina: it.pagina, y: it.y, itens: [it] });
  }
  for (const l of out) l.itens.sort((a, b) => a.x - b.x);
  return out;
}

export type LinhaComSaldo = LinhaBruta & { saldo?: number };
export interface ExtratoPdf { linhas: LinhaComSaldo[]; banco: string }

const RE_DATA = /^\d{2}[-/.]\d{2}[-/.]\d{4}$/;
const RE_VALOR = /^-?\s*R\$\s*-?\s*[\d.]+,\d{2}$/;

/** Monta as linhas do extrato a partir do texto posicionado. Lança erro se não reconhecer a tabela. */
export function lerExtratoPdf(itens: ItemTexto[]): ExtratoPdf {
  const ls = linhas(itens);
  const banco = /mercado\s*pago/i.test(itens.map(i => i.texto).join(' ')) ? 'Mercado Pago' : '';
  // Colunas pelo cabeçalho de cada página.
  const cab = new Map<number, { y: number; desc: number; id: number; valor: number; saldo: number }>();
  for (const l of ls) {
    const t = l.itens.map(i => norm(i.texto).trim());
    const x = (re: RegExp) => l.itens[t.findIndex(s => re.test(s))]?.x ?? NaN;
    if (!cab.has(l.pagina) && t.includes('data') && t.some(s => /^descricao/.test(s)) && t.some(s => /^valor/.test(s))) {
      cab.set(l.pagina, { y: l.y, desc: x(/^descricao/), id: x(/^id/), valor: x(/^valor/), saldo: x(/^saldo/) });
    }
  }
  if (!cab.size) throw new Error('Não reconheci a tabela deste PDF (procurei as colunas Data, Descrição e Valor).');
  type Mov = { pagina: number; y: number; data: string; id: string; valor: number; saldo?: number; partes: { y: number; t: string }[] };
  const movs: Mov[] = [];
  const soltos: { pagina: number; y: number; t: string }[] = [];
  for (const l of ls) {
    const c = cab.get(l.pagina);
    if (!c || l.y >= c.y - 1) continue; // acima do cabeçalho (resumo, nome) fica de fora
    const fimDesc = Number.isFinite(c.id) ? c.id - 4 : c.valor - 4;
    const naDesc = (i: ItemTexto) => i.x >= c.desc - 6 && i.x < fimDesc;
    const dataIt = l.itens.find(i => RE_DATA.test(i.texto) && i.x < c.desc - 2);
    const valores = l.itens.filter(i => RE_VALOR.test(i.texto.replace(/\s+/g, ' ')));
    if (dataIt && valores.length) {
      const data = parseData(dataIt.texto);
      const valorIt = valores.find(i => i.x >= c.valor - 30 && (!Number.isFinite(c.saldo) || i.x < c.saldo - 10)) || valores[0];
      const saldoIt = Number.isFinite(c.saldo) ? valores.find(i => i !== valorIt && i.x >= c.saldo - 30) : undefined;
      const valor = parseValor(valorIt.texto);
      if (!data || !Number.isFinite(valor)) continue;
      const idIt = l.itens.find(i => /^\d{6,}$/.test(i.texto) && i.x >= fimDesc - 2 && i.x < c.valor - 10);
      movs.push({ pagina: l.pagina, y: l.y, data, id: idIt?.texto || '', valor, ...(saldoIt ? { saldo: parseValor(saldoIt.texto) } : {}),
        partes: l.itens.filter(naDesc).map(i => ({ y: l.y, t: i.texto })) });
    } else {
      const t = l.itens.filter(naDesc).map(i => i.texto).join(' ');
      if (t && l.itens.every(naDesc)) soltos.push({ pagina: l.pagina, y: l.y, t });
    }
  }
  if (!movs.length) throw new Error('Não achei movimentos neste PDF.');
  // Cada pedaço solto de descrição vai para o movimento mais próximo na mesma página (até 20 pontos).
  // Pedaço no pé da página, longe de tudo, é o começo do primeiro movimento da página seguinte
  // (a linha foi cortada pela quebra de página).
  for (const s of soltos) {
    let melhor: Mov | null = null;
    for (const m of movs) if (m.pagina === s.pagina && Math.abs(m.y - s.y) <= 20 && (!melhor || Math.abs(m.y - s.y) < Math.abs(melhor.y - s.y))) melhor = m;
    if (melhor) { melhor.partes.push({ y: s.y, t: s.t }); continue; }
    const daPagina = movs.filter(m => m.pagina === s.pagina);
    const abaixoDeTodos = daPagina.every(m => s.y < m.y);
    const seguinte = movs.find(m => m.pagina > s.pagina);
    if (abaixoDeTodos && seguinte && seguinte.pagina === s.pagina + 1) seguinte.partes.push({ y: Number.POSITIVE_INFINITY, t: s.t });
  }
  return {
    banco,
    linhas: movs.map(m => ({
      data: m.data, valor: m.valor,
      desc: m.partes.sort((a, b) => b.y - a.y).map(p => p.t).join(' ').replace(/\s+/g, ' ').trim() || '(sem descrição)',
      ...(m.id ? { id: m.id } : {}), ...(m.saldo != null && Number.isFinite(m.saldo) ? { saldo: m.saldo } : {}),
    })),
  };
}
