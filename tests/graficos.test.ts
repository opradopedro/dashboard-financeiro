import { describe, expect, it } from 'vitest';
import { encosta, posicionarRotulos, type Elipse } from '../src/ui/graficos';

const W = 340;
const disco: Elipse = { cx: 170, cy: 110, a: 115, b: 66 };

describe('rótulos da pizza', () => {
  it('encosta: caixa ao lado do disco, na altura do meio, encosta; acima, não', () => {
    expect(encosta(0, 70, 90, 120, disco)).toBe(true);
    expect(encosta(0, 70, 0, 40, disco)).toBe(false);
    expect(encosta(0, 40, 90, 120, disco)).toBe(false); // estreito o bastante para caber ao lado
  });
  it('rótulo que cairia em cima do disco sobe (ou desce) até ficar livre', () => {
    const [y] = posicionarRotulos([{ desejado: 115, largura: 66 }], 'esq', W, [disco]);
    expect(encosta(0, 74, y - 30, y + 2, disco)).toBe(false);
    expect(Math.abs(y - 115)).toBeGreaterThan(0);
  });
  it('rótulo que já está livre fica onde queria', () => {
    expect(posicionarRotulos([{ desejado: 40, largura: 60 }], 'dir', W, [disco])).toEqual([40]);
  });
  it('dois rótulos do mesmo lado não ficam um em cima do outro', () => {
    const ys = posicionarRotulos([{ desejado: 40, largura: 60 }, { desejado: 42, largura: 60 }], 'dir', W, [disco]);
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(34);
    for (const y of ys) expect(encosta(W - 68, W, y - 30, y + 2, disco)).toBe(false);
  });
});
