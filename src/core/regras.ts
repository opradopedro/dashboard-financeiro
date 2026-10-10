// Regras de notificação: texto da notificação → transação. Uma regra é uma expressão regular com
// grupos nomeados: valor (obrigatório), desc e data (opcionais). A regra de maior prioridade que
// casar decide; se ela for "ignorar", a notificação fica registrada como ignorada.
import type { AcaoRegra, Conta, FiltroNotif, RegraNotif, TipoTx } from './tipos';
import { arred, dataLocal, norm, parseValor } from './util';

export interface NotifEntrada { pacote: string; titulo: string; texto: string; quando: number }

export interface TxDeRegra { data: string; desc: string; valor: number; conta: string; tipo: TipoTx }

export type Resultado =
  | { status: 'transacao'; regra: RegraNotif; tx: TxDeRegra; grupos: Record<string, string> }
  | { status: 'ignorada'; regra: RegraNotif; grupos: Record<string, string> }
  | { status: 'sem-regra' }
  | { status: 'erro'; regra: RegraNotif; erro: string };

/** Texto que as regras enxergam: título e texto separados por quebra de linha. */
export const textoNotif = (n: Pick<NotifEntrada, 'titulo' | 'texto'>) => `${n.titulo.trim()}\n${n.texto.trim()}`;

/** Compila o padrão; lança erro com mensagem amigável se a expressão for inválida. */
export function compilar(padrao: string): RegExp {
  try { return new RegExp(padrao, 'i'); }
  catch (e) { throw new Error(`Expressão inválida: ${(e as Error).message.replace(/^Invalid regular expression: /, '')}`); }
}

/** Data do grupo "data" (dd/mm, dd/mm/aa ou dd/mm/aaaa) ou, sem ele, o dia em que a notificação chegou. */
export function dataDaNotif(grupo: string | undefined, quando: number): string {
  const base = dataLocal(quando);
  const m = grupo && /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(grupo);
  if (!m) return base;
  const d = +m[1], mes = +m[2];
  let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : +base.slice(0, 4);
  const p = (n: number) => String(n).padStart(2, '0');
  let s = `${y}-${p(mes)}-${p(d)}`;
  if (isNaN(Date.parse(s)) || mes > 12 || d > 31) return base;
  // Sem ano e caindo no futuro (ex.: notificação de 02/01 falando de 30/12): é do ano anterior.
  if (!m[3] && s > base) { y--; s = `${y}-${p(mes)}-${p(d)}`; }
  return s;
}

const limpa = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();

/** Aplica uma regra a uma notificação (sem olhar app nem prioridade). null = não casou. */
export function aplicarRegra(r: RegraNotif, n: NotifEntrada): Exclude<Resultado, { status: 'sem-regra' }> | null {
  let re: RegExp;
  try { re = compilar(r.padrao); } catch (e) { return { status: 'erro', regra: r, erro: (e as Error).message }; }
  const m = re.exec(textoNotif(n));
  if (!m) return null;
  const grupos: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.groups || {})) if (v != null) grupos[k] = v.trim();
  if (r.acao === 'ignorar') return { status: 'ignorada', regra: r, grupos };
  if (grupos.valor == null) return { status: 'erro', regra: r, erro: 'A regra casou, mas não tem o grupo (?<valor>…) ou ele ficou vazio.' };
  const v = parseValor(grupos.valor);
  if (!Number.isFinite(v) || v === 0) return { status: 'erro', regra: r, erro: `Não consegui ler o valor "${grupos.valor}".` };
  let desc = '';
  if (r.descricao?.trim()) {
    // Modelo com {grupo}: só vale se algum grupo citado veio preenchido (senão sobraria "Pix de").
    const citados = [...r.descricao.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    if (!citados.length || citados.some(k => grupos[k])) desc = limpa(r.descricao.replace(/\{(\w+)\}/g, (_, k) => grupos[k] ?? ''));
  }
  if (!desc) desc = limpa(grupos.desc || '') || limpa(n.titulo) || 'Notificação';
  return {
    status: 'transacao', regra: r, grupos,
    tx: { data: dataDaNotif(grupos.data, n.quando), desc, valor: arred(r.sentido === 'sai' ? -Math.abs(v) : Math.abs(v)), conta: r.conta, tipo: r.acao as TipoTx },
  };
}

/** Regras ativas do app, da maior prioridade para a menor (empate: a mais antiga na lista). */
export function regrasDoApp(regras: RegraNotif[], pacote: string) {
  return regras.map((r, i) => ({ r, i })).filter(x => x.r.ativa && x.r.pacote === pacote)
    .sort((a, b) => b.r.prioridade - a.r.prioridade || a.i - b.i).map(x => x.r);
}

/**
 * Passa a notificação pelas regras do app. Regra com expressão inválida é pulada (as outras ainda
 * são testadas); se nenhuma casar e alguma deu erro, o status é erro. Conta inexistente também é erro.
 */
export function processar(n: NotifEntrada, regras: RegraNotif[], contas: Conta[]): Resultado {
  let erro: Resultado | null = null;
  for (const r of regrasDoApp(regras, n.pacote)) {
    const res = aplicarRegra(r, n);
    if (!res) continue;
    if (res.status === 'erro') { erro ||= res; continue; }
    if (res.status === 'transacao' && !contas.some(c => c.id === res.tx.conta))
      return { status: 'erro', regra: r, erro: 'A conta de destino desta regra não existe mais.' };
    return res;
  }
  return erro || { status: 'sem-regra' };
}

/**
 * Filtro antes das regras (o Android faz o mesmo em Fila.kt para não avisar): devolve o motivo
 * para ignorar ('palavra:<p>' se tem uma palavra da lista; 'valor' se não fala de dinheiro, sem
 * "$" nem "reais") ou null se a notificação segue para as regras.
 */
export function filtrarNotif(n: Pick<NotifEntrada, 'titulo' | 'texto'>, f: FiltroNotif): string | null {
  const t = textoNotif(n), tn = norm(t);
  for (const p of f.palavras) { const pn = norm(p).trim(); if (pn && tn.includes(pn)) return `palavra:${p}`; }
  if (f.exigirValor && !/\$|\breais\b/i.test(t)) return 'valor';
  return null;
}

/** O motivo do filtro em palavras. */
export const motivoFiltro = (m: string) => (m === 'valor' ? 'não fala de valor (sem “$” nem “reais”)' : `tem “${m.replace(/^palavra:/, '')}”`);

/** Sentido padrão para cada ação (o editor preenche e você pode trocar). */
export const sentidoPadrao = (a: AcaoRegra): 'sai' | 'entra' => (a === 'entrada' ? 'entra' : 'sai');

/** Escapa um texto para usar literalmente numa expressão regular. */
export const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Sugere um padrão a partir de uma notificação real: o texto literal, com o primeiro valor em R$
 * virando o grupo valor. É um começo: troque partes variáveis (nome da loja) por grupos.
 */
export function sugerirPadrao(titulo: string, texto: string): string {
  const t = textoNotif({ titulo, texto });
  const m = /R\$\s?\d[\d.]*,\d{2}/.exec(t);
  if (!m) return escRe(t).replace(/\n/g, '\\n');
  const antes = escRe(t.slice(0, m.index)).replace(/\n/g, '\\n');
  return `${antes}R\\$\\s?(?<valor>\\d[\\d.]*,\\d{2})`;
}
