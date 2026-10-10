import { describe, expect, it } from 'vitest';
import novidades from '../src/novidades.json';

// O workflow usa a primeira de "versoes" como número da Release e "itens" como notas.
describe('novidades.json', () => {
  it('versões com número, data e itens, da mais nova para a mais antiga, sem repetir', () => {
    const vs = novidades.versoes;
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) {
      expect(v.versao).toMatch(/^\d+\.\d+$/);
      expect(v.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.itens.length).toBeGreaterThan(0);
    }
    const num = (s: string) => s.split('.').map(Number);
    for (let i = 1; i < vs.length; i++) {
      const [a1, b1] = num(vs[i - 1].versao), [a2, b2] = num(vs[i].versao);
      expect(a1 > a2 || (a1 === a2 && b1 > b2)).toBe(true);
      expect(vs[i - 1].data >= vs[i].data).toBe(true);
    }
    expect(Array.isArray(novidades.proxima)).toBe(true);
  });
});
