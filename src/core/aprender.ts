// Aprendizado com o que você já categorizou. Duas formas, as duas simples e explicáveis:
// 1. Contraparte: a mesma pessoa ou loja (descrição sem "Pix enviado", códigos, CNPJ…) recebe a
//    categoria que você deu a ela antes (e o tipo, se você mudou o tipo pelo menos 2 vezes igual).
// 2. Palavras (Bayes ingênuo): palavras da descrição que costumam aparecer numa categoria. Só
//    sugere com confiança alta e pelo menos 2 exemplos daquela categoria.
// Só aprende com escolhas suas (`cat` e `tipoUsuario` gravados na transação), nunca com o que o
// próprio app deduziu.
import type { TipoTx, Transacao } from './tipos';
import { norm } from './util';

/** Começos de descrição que não dizem quem é (o que importa vem depois). */
const PREFIXOS = [
  'transferencia pix enviada para', 'transferencia pix recebida de', 'transferencia pix enviada', 'transferencia pix recebida',
  'transferencia enviada pelo pix', 'transferencia recebida pelo pix', 'transferencia enviada', 'transferencia recebida',
  'pix enviado para', 'pix recebido de', 'pix enviado', 'pix recebido', 'pix enviada', 'pix recebida',
  'pagamento com codigo qr pix', 'pagamento com codigo qr', 'pagamento com qr pix', 'pagamento com qr', 'pagamento com pix',
  'pagamento de boleto', 'pagamento', 'compra no debito', 'compra no credito', 'compra aprovada em', 'compra aprovada', 'compra em', 'compra',
  'debito automatico', 'ted enviada', 'ted recebida', 'doc enviado', 'doc recebido', 'estorno',
];
/** Palavras sem informação sobre quem é. */
const VAZIAS = new Set(['ltda', 'eireli', 'me', 'sa', 's', 'a', 'bra', 'br', 'com', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'para', 'por',
  'pix', 'qr', 'codigo', 'pagamento', 'enviado', 'recebido', 'enviada', 'recebida', 'transferencia', 'compra', 'parcela', 'nupay']);

/** Quem é a outra ponta: "Pix enviado 50.683.265 Fulana de Tal" → "fulana tal". */
export function contraparte(desc: string): string {
  let t = norm(desc).trim();
  for (const p of PREFIXOS) if (t === p || t.startsWith(p + ' ')) { t = t.slice(p.length).trim(); break; }
  const palavras = t.split(' ').filter(w => w && !/\d/.test(w) && !VAZIAS.has(w));
  return palavras.slice(0, 4).join(' ');
}

const tokens = (desc: string) => [...new Set(norm(desc).trim().split(' ').filter(w => w.length >= 3 && !/\d/.test(w) && !VAZIAS.has(w)))];

interface Contagem<K> { total: number; por: Map<K, number> }
const somar = <K>(m: Map<string, Contagem<K>>, chave: string, k: K) => {
  const c = m.get(chave) || { total: 0, por: new Map<K, number>() };
  c.total++; c.por.set(k, (c.por.get(k) || 0) + 1);
  m.set(chave, c);
};
const maisVotado = <K>(c: Contagem<K>) => [...c.por].sort((a, b) => b[1] - a[1])[0];

export interface Modelo {
  cats: Map<string, Contagem<string>>;   // contraparte → categorias escolhidas
  tipos: Map<string, Contagem<TipoTx>>;  // contraparte → tipos escolhidos
  palavras: Map<string, Map<string, number>>; // categoria → palavra → vezes
  exemplos: Map<string, number>;         // categoria → nº de transações
  vocab: Set<string>;
  n: number;
}

/** Monta o modelo com as transações que você categorizou ou cujo tipo você mudou. */
export function treinar(txs: Transacao[]): Modelo {
  const m: Modelo = { cats: new Map(), tipos: new Map(), palavras: new Map(), exemplos: new Map(), vocab: new Set(), n: 0 };
  for (const t of txs) {
    const quem = contraparte(t.desc);
    if (t.tipoUsuario && quem) somar(m.tipos, quem, t.tipoUsuario);
    if (!t.cat) continue;
    if (quem) somar(m.cats, quem, t.cat);
    m.n++;
    m.exemplos.set(t.cat, (m.exemplos.get(t.cat) || 0) + 1);
    const p = m.palavras.get(t.cat) || new Map<string, number>();
    for (const w of tokens(t.desc)) { p.set(w, (p.get(w) || 0) + 1); m.vocab.add(w); }
    m.palavras.set(t.cat, p);
  }
  return m;
}

export interface Previsao { cat: string; fonte: 'contraparte' | 'palavras'; exemplos: number }

/**
 * Categoria pela contraparte (basta 1 escolha sua, se for a mais votada com pelo menos 2/3 dos votos).
 * `pode(cat)` diz se a categoria serve (entrada só em categoria de receita, e vice-versa).
 */
export function porContraparte(m: Modelo, desc: string, pode: (cat: string) => boolean): Previsao | null {
  const c = m.cats.get(contraparte(desc));
  if (!c) return null;
  const [cat, n] = maisVotado(c);
  return n / c.total >= 2 / 3 && pode(cat) ? { cat, fonte: 'contraparte', exemplos: n } : null;
}

/** Categoria pelas palavras (Bayes ingênuo); só com confiança de 70% e 2 exemplos da categoria. */
export function porPalavras(m: Modelo, desc: string, pode: (cat: string) => boolean): Previsao | null {
  const ws = tokens(desc).filter(w => m.vocab.has(w));
  if (!ws.length || m.n < 2) return null;
  const V = m.vocab.size;
  const notas: [string, number][] = [];
  for (const [cat, ex] of m.exemplos) {
    if (!pode(cat)) continue;
    const p = m.palavras.get(cat)!;
    const total = [...p.values()].reduce((a, b) => a + b, 0);
    let s = Math.log(ex / m.n);
    for (const w of ws) s += Math.log(((p.get(w) || 0) + 1) / (total + V));
    notas.push([cat, s]);
  }
  if (!notas.length) return null;
  const max = Math.max(...notas.map(x => x[1]));
  const soma = notas.reduce((a, [, s]) => a + Math.exp(s - max), 0);
  const [cat, s] = notas.sort((a, b) => b[1] - a[1])[0];
  const conf = Math.exp(s - max) / soma;
  const ex = m.exemplos.get(cat) || 0;
  // Precisa de ao menos uma palavra que já apareceu nessa categoria.
  const apoio = ws.some(w => (m.palavras.get(cat)!.get(w) || 0) > 0);
  return conf >= 0.7 && ex >= 2 && apoio ? { cat, fonte: 'palavras', exemplos: ex } : null;
}

/** Tipo pela contraparte: você mudou o tipo dela pelo menos 2 vezes, e sempre (80%) para o mesmo. */
export function tipoAprendido(m: Modelo, desc: string): TipoTx | null {
  const c = m.tipos.get(contraparte(desc));
  if (!c || c.total < 2) return null;
  const [t, n] = maisVotado(c);
  return n / c.total >= 0.8 ? t : null;
}
