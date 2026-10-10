import { describe, expect, it } from 'vitest';
import { brParaIso, isoParaBr, mascara } from '../src/ui/datas';

describe('campo de data dd/mm/aaaa', () => {
  it('barras automáticas enquanto digita', () => {
    expect(mascara('2')).toBe('2');
    expect(mascara('280')).toBe('28/0');
    expect(mascara('28082026')).toBe('28/08/2026');
    expect(mascara('28/08/20261')).toBe('28/08/2026');
  });
  it('converte e recusa datas que não existem', () => {
    expect(brParaIso('28/08/2026')).toBe('2026-08-28');
    expect(brParaIso('29/02/2026')).toBeNull();
    expect(brParaIso('31/04/2026')).toBeNull();
    expect(brParaIso('08/28/2026')).toBeNull();
    expect(brParaIso('28/08/26')).toBeNull();
    expect(isoParaBr('2026-08-28')).toBe('28/08/2026');
    expect(isoParaBr('')).toBe('');
  });
});
