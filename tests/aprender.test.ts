import { describe, expect, it } from 'vitest';
import { contraparte, porContraparte, porPalavras, tipoAprendido, treinar } from '../src/core/aprender';
import { classificar, type Classificada } from '../src/core/classificar';
import { candidatosReembolso, possiveisReembolsos, sugerirTitular } from '../src/core/sugestoes';
import { CATEGORIAS_INICIAIS, CONTAS_INICIAIS } from '../src/core/padroes';
import type { Transacao } from '../src/core/tipos';

let n = 0;
const tx = (desc: string, valor: number, extra: Partial<Transacao> = {}, data = '2026-08-10', conta = 'mercadopago-conta'): Transacao =>
  ({ id: 't' + ++n, conta, data, desc, valor, origens: [], criadoEm: '', ...extra });
const ctx = { contas: CONTAS_INICIAIS, categorias: CATEGORIAS_INICIAIS, regrasCat: [] };
const tudo = () => true;

describe('contraparte', () => {
  it('tira o começo genérico, números e sufixos', () => {
    expect(contraparte('Pagamento com código QR Antonio Fernandes Luiz')).toBe('antonio fernandes luiz');
    expect(contraparte('Pix enviado 50.683.265 Fulana Alves Domingues')).toBe('fulana alves domingues');
    expect(contraparte('Pagamento com QR Pix LOCAL ESTACIONAMENTO LTDA')).toBe('local estacionamento');
    expect(contraparte('Transferência Pix enviada para Beltrano Souza')).toBe('beltrano souza');
  });
});

describe('aprende com suas escolhas', () => {
  it('a mesma contraparte recebe a categoria que você deu (e vence a palavra-chave)', () => {
    const ts = [tx('Pagamento com código QR Antonio Fernandes Luiz', -20, { cat: 'Transporte' }), tx('Pagamento com código QR Antonio Fernandes Luiz', -20)];
    const cls = classificar(ts, ctx);
    expect(cls[1]).toMatchObject({ c: 'Transporte', fc: 'contraparte', aprendida: 1 });
    // "Pix enviado" seria Transferências pela palavra; o que você escolheu para a pessoa vence.
    const c2 = classificar([tx('Pix enviado Fulana Alves', -145, { cat: 'Beleza' }), tx('Pix enviado Fulana Alves', -80)], { ...ctx, categorias: [...CATEGORIAS_INICIAIS, { nome: 'Beleza', receita: false, palavras: [] }] });
    expect(c2[1].c).toBe('Beleza');
  });
  it('categoria de entrada não vai para gasto, e vice-versa', () => {
    const m = treinar([tx('Pix recebido Ciclano Souza', 50, { cat: 'Outras receitas' })]);
    expect(porContraparte(m, 'Pix enviado Ciclano Souza', cat => cat === 'Alimentação')).toBeNull();
  });
  it('sem acordo (menos de 2/3), não decide', () => {
    const m = treinar([tx('Pix enviado Wesley Melo', -16, { cat: 'Lazer' }), tx('Pix enviado Wesley Melo', -16, { cat: 'Alimentação' })]);
    expect(porContraparte(m, 'Pix enviado Wesley Melo', tudo)).toBeNull();
  });
  it('por palavras: lojas parecidas, com 2 exemplos e confiança', () => {
    const m = treinar([tx('AUTO POSTO MARECHAL', -100, { cat: 'Transporte' }), tx('AUTO POSTO PRESIDENTE', -90, { cat: 'Transporte' }), tx('PADARIA PAO QUENTE', -9, { cat: 'Alimentação' }), tx('PADARIA BOM GOSTO', -8, { cat: 'Alimentação' })]);
    expect(porPalavras(m, 'AUTO POSTO ROTARY', tudo)?.cat).toBe('Transporte');
    expect(porPalavras(m, 'LOJA QUALQUER', tudo)).toBeNull();
  });
  it('tipo: só depois de 2 escolhas iguais', () => {
    const um = treinar([tx('Pix enviado Joao Lima', -10, { tipoUsuario: 'interna' })]);
    expect(tipoAprendido(um, 'Pix enviado Joao Lima')).toBeNull();
    const dois = treinar([tx('Pix enviado Joao Lima', -10, { tipoUsuario: 'interna' }), tx('Pix enviado Joao Lima', -20, { tipoUsuario: 'interna' })]);
    expect(tipoAprendido(dois, 'Pix enviado Joao Lima')).toBe('interna');
  });
});

describe('sugestões', () => {
  it('seu nome: o que aparece em Pix recebidos e enviados', () => {
    const ts = [tx('Pix recebido FULANO DE TAL SILVA', 975), tx('Pix enviado Fulano de Tal Silva', -560), tx('Pix recebido FULANO DE TAL SILVA', 650), tx('Pix recebido MARIA SOUZA LIMA', 100), tx('Pix recebido MARIA SOUZA LIMA', 100)];
    expect(sugerirTitular(ts)).toBe('Fulano de Tal Silva');
    expect(sugerirTitular(ts.slice(3))).toBeNull();
  });
  it('reembolso: gasto de valor igual por perto; marcado, desconta do gasto na categoria dele', () => {
    const ts = [tx('Pix recebido Vinicius Lira', 600, {}, '2026-08-07'), tx('Pagamento com QR Pix FUNILARIA RODRIGUES', -600, { cat: 'Transporte' }, '2026-08-14'), tx('Mercado', -50, {}, '2026-08-08')];
    const cls = classificar(ts, ctx);
    expect(possiveisReembolsos(cls).map(r => [r.x.id, r.cands.map(c => c.id)])).toEqual([[ts[0].id, [ts[1].id]]]);
    const marcado = classificar([{ ...ts[0], reembolsa: ts[1].id }, ts[1], ts[2]], ctx);
    expect(marcado[0]).toMatchObject({ t: 'saida', c: 'Transporte', par: ts[1].id, fc: 'reembolso' });
    expect(marcado[1].reembolsos).toEqual([ts[0].id]);
    expect(candidatosReembolso(marcado, marcado[0] as Classificada)).toEqual([]);
  });
  it('reembolso sem ligar: desconta do gasto na categoria que você escolher', () => {
    const cls = classificar([tx('Pix recebido Maria Eduarda Santos', 13, { reembolsa: '', cat: 'Alimentação' }), tx('Restaurante', -40, { cat: 'Alimentação' })], ctx);
    expect(cls[0]).toMatchObject({ t: 'saida', c: 'Alimentação' });
  });
});

describe('pagamento de cartão na conta', () => {
  it('sem o cartão do banco no app, conta como gasto (ex.: parcelas de um videogame)', () => {
    const cls = classificar([tx('Pagamento Cartão de crédito', -305.19)], ctx);
    expect(cls[0].t).toBe('saida');
  });
  it('com compras desse cartão no app, continua pagamento de fatura', () => {
    const cls = classificar([tx('Compra MERCADO', -305.19, {}, '2026-07-20', 'mercadopago-cartao'), tx('Pagamento Cartão de crédito', -305.19, {}, '2026-08-05')], ctx);
    expect(cls[1].t).toBe('fatura');
  });
  it('Nomad é viagem', () => {
    expect(classificar([tx('Pix enviado Nomad Fintech Inc', -3500)], ctx)[0].c).toBe('Viagem');
  });
});

describe('vínculo de reembolso e categoria', () => {
  it('mudar a categoria no reembolso muda no gasto; mudar no gasto, o reembolso segue', async () => {
    const { definirCategoria } = await import('../src/core/sugestoes');
    const gasto = tx('Pagamento com QR Pix DOUGLAS', -200, { cat: 'Transporte' }, '2026-09-23');
    const reemb = tx('Pix recebido Marli', 200, { reembolsa: gasto.id, cat: 'Outras receitas' }, '2026-09-23');
    // A categoria do vínculo é a do gasto.
    expect(classificar([gasto, reemb], ctx)[1].c).toBe('Transporte');
    // No reembolso: vai para o gasto (e o reembolso perde a categoria própria).
    let ts = definirCategoria([gasto, reemb], [reemb.id], 'Compras');
    expect(ts.map(t => t.cat)).toEqual(['Compras', undefined]);
    expect(classificar(ts, ctx).map(x => x.c)).toEqual(['Compras', 'Compras']);
    // No gasto: o reembolso segue.
    ts = definirCategoria(ts, [gasto.id], 'Lazer');
    expect(classificar(ts, ctx).map(x => x.c)).toEqual(['Lazer', 'Lazer']);
    // Sem vínculo, só a própria muda.
    const solta = tx('Padaria', -5);
    expect(definirCategoria([solta, gasto], [solta.id], 'Alimentação').map(t => t.cat)).toEqual(['Alimentação', 'Transporte']);
  });
});
