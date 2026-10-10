import { describe, expect, it } from 'vitest';
import type { Classificada } from '../src/core/classificar';
import { ehVazio, filtrar, filtroVazio, juntarFiltros } from '../src/core/filtros';
import { CONTAS_INICIAIS } from '../src/core/padroes';

const tx = (id: string, conta: string, desc: string, valor: number, c = '', t: Classificada['t'] = valor < 0 ? 'saida' : 'entrada'): Classificada =>
  ({ id, conta, data: '2026-09-01', desc, valor, origens: [], criadoEm: '', t, c, auto: true });
const cls = [
  tx('a', 'nubank-cartao', 'Loja', -10, 'Compras'),
  tx('b', 'mercadopago-conta', 'Pix enviado Fulano', -20, 'Transferências'),
  tx('c', 'flash', 'Padaria', -30, 'Alimentação'),
  tx('d', 'mercadopago-conta', 'Pix recebido', 100),
];
const ids = (f: Parameters<typeof filtrar>[0]) => filtrar(f, cls, CONTAS_INICIAIS).map(x => x.id);

describe('filtros', () => {
  it('vazio não filtra', () => {
    expect(ehVazio(filtroVazio())).toBe(true);
    expect(ids(filtroVazio())).toEqual(['a', 'b', 'c', 'd']);
  });
  it('por conta, categoria (inclui "Sem categoria") e forma de pagamento (só gastos)', () => {
    expect(ids({ ...filtroVazio(), contas: ['mercadopago-conta'] })).toEqual(['b', 'd']);
    expect(ids({ ...filtroVazio(), cats: ['Sem categoria'] })).toEqual(['d']);
    expect(ids({ ...filtroVazio(), formas: ['pix'] })).toEqual(['b']);
    expect(ids({ ...filtroVazio(), formas: ['credito', 'vale'] })).toEqual(['a', 'c']);
  });
  it('vários filtros: valores de um campo somam, campos diferentes se combinam', () => {
    const nubank = { ...filtroVazio(), contas: ['nubank-cartao'] }, flash = { ...filtroVazio(), contas: ['flash'] };
    expect(ids(juntarFiltros([nubank, flash]))).toEqual(['a', 'c']);
    const alim = { ...filtroVazio(), cats: ['Alimentação'] };
    expect(ids(juntarFiltros([nubank, flash, alim]))).toEqual(['c']);
  });
});
