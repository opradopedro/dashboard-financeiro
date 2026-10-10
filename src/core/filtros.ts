// Filtros do Painel: por conta, forma de pagamento e categoria. Um filtro vazio num campo não
// restringe nada. Vários filtros juntos (salvos ou não): os valores de cada campo se somam (conta A
// ou conta B) e os campos se combinam (conta E forma E categoria).
import { SEM_CATEGORIA, type Classificada } from './classificar';
import { formaPagamento } from './indicadores';
import type { Conta, Filtro } from './tipos';

export type { Filtro, FiltroSalvo } from './tipos';

export const filtroVazio = (): Filtro => ({ contas: [], formas: [], cats: [] });
export const ehVazio = (f: Filtro) => !f.contas.length && !f.formas.length && !f.cats.length;

const uniao = <T>(xs: T[][]) => [...new Set(xs.flat())];

/** Junta vários filtros num só (união dos valores de cada campo). */
export const juntarFiltros = (fs: Filtro[]): Filtro =>
  ({ contas: uniao(fs.map(f => f.contas)), formas: uniao(fs.map(f => f.formas)), cats: uniao(fs.map(f => f.cats)) });

/** A transação passa no filtro? A forma de pagamento só restringe gastos (saídas). */
export function passa(f: Filtro, x: Classificada, contas: Map<string, Conta>): boolean {
  if (f.contas.length && !f.contas.includes(x.conta)) return false;
  if (f.cats.length && !f.cats.includes(x.c || SEM_CATEGORIA)) return false;
  if (f.formas.length && !(x.t === 'saida' && f.formas.includes(formaPagamento(x, contas.get(x.conta))))) return false;
  return true;
}

/** Aplica o filtro a uma lista (sem filtro, devolve a própria lista). */
export function filtrar(f: Filtro, cls: Classificada[], contas: Conta[]): Classificada[] {
  if (ehVazio(f)) return cls;
  const m = new Map(contas.map(c => [c.id, c]));
  return cls.filter(x => passa(f, x, m));
}
