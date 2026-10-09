import { describe, expect, it } from 'vitest';
import { lerBackup, montarBackup, sanear } from '../src/core/backup';
import { dadosIniciais } from '../src/core/padroes';
import { receber } from '../src/core/ingestao';

describe('backup', () => {
  it('ida e volta preserva tudo', () => {
    const d = receber(dadosIniciais(), [{ chave: 'k', pacote: 'com.nu.production', titulo: 'Compra', texto: 'Compra de R$ 1,00 APROVADA em X.', quando: Date.now() }]).dados;
    d.config.boasVindasVista = true;
    d.contas[0].saldoRef = { valor: 10, data: '2026-10-01' };
    const volta = lerBackup(JSON.stringify(montarBackup(d)));
    expect(volta).toEqual(d);
  });
  it('recusa arquivo que não é backup', () => {
    expect(() => lerBackup('{"formato":"finai-banco/1"}')).toThrow(/finai-banco/);
    expect(() => lerBackup('x')).toThrow();
  });
  it('dados incompletos ganham os valores iniciais', () => {
    const d = sanear({ txs: [{ id: 'a', conta: 'c', data: '2026-10-01', valor: 1, origens: [] }, { id: 'b' }] });
    expect(d.txs).toHaveLength(1);
    expect(d.contas).toHaveLength(5);
    expect(d.regras.length).toBeGreaterThan(5);
  });
});
