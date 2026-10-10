// Notificações reais enviadas pelo usuário (texto de exemplo; nomes trocados nos testes de regra automática).
import { describe, expect, it } from 'vitest';
import { processar } from '../src/core/regras';
import { CONTAS_INICIAIS, REGRAS_INICIAIS, dadosIniciais } from '../src/core/padroes';
import { acaoProvavel, aplicarDecisoes, gerarRegraAuto, gerarRegraIgnorar } from '../src/core/automatica';
import { receber } from '../src/core/ingestao';
import { migrar } from '../src/core/migracoes';
import { sanear } from '../src/core/backup';
import REGRAS_V1 from '../src/core/regras-v1.json';
import type { Dados, Notificacao } from '../src/core/tipos';

const quando = new Date(2026, 9, 9, 19, 18).getTime();
const MP = 'com.mercadopago.wallet', NU = 'com.nu.production', FLASH = 'br.com.flashapp';
const n = (pacote: string, titulo: string, texto: string, id = Math.random().toString(36)): Notificacao =>
  ({ id, pacote, titulo, texto, quando, status: 'sem-regra' });
const proc = (x: Notificacao) => processar(x, REGRAS_INICIAIS, CONTAS_INICIAIS);

const PIX = n(MP, 'Você recebeu R$ 1', 'O valor que Maria Aparecida Souza te transferiu via Pix já está disponível na sua conta.');
const DEPOSITO = n(MP, 'Seu dinheiro já está disponível', 'Você depositou R$ 0,01 via Pix e o valor já está rendendo na sua conta.');
const NU_TRANSF = n(NU, 'Transferência recebida', 'Recebemos sua transferência de R$ 0,01.');
const FLASH_CRED = n(FLASH, 'Compra aprovada no crédito', 'Compra de R$ 32,00 em CAFE CENTRAL EMPORIO realizada. Seu saldo em Alimentação e Refeição é R$ 941,31.');
const FLASH_VOUCHER = n(FLASH, 'Compra aprovada no voucher', 'Compra de R$ 1.080,92 em Supermercado realizada. Seu saldo em Alimentação e Refeição é R$ 1.005,31.');

describe('regras padrão com as notificações reais', () => {
  it('Mercado Pago: Pix recebido com valor sem centavos e nome de quem mandou', () => {
    const r = proc(PIX);
    expect(r.status === 'transacao' && r.tx).toMatchObject({ valor: 1, tipo: 'entrada', conta: 'mercadopago-conta', desc: 'Pix de Maria Aparecida Souza' });
  });
  it('Mercado Pago: depósito seu vira transferência interna', () => {
    const r = proc(DEPOSITO);
    expect(r.status === 'transacao' && r.tx).toMatchObject({ valor: 0.01, tipo: 'interna', conta: 'mercadopago-conta' });
  });
  it('Nubank: transferência sua para a conta Nubank é ignorada', () => {
    expect(proc(NU_TRANSF).status).toBe('ignorada');
  });
  it('Flash: compra no crédito e no voucher', () => {
    const a = proc(FLASH_CRED), b = proc(FLASH_VOUCHER);
    expect(a.status === 'transacao' && a.tx).toMatchObject({ valor: -32, desc: 'CAFE CENTRAL EMPORIO', conta: 'flash', tipo: 'saida' });
    expect(b.status === 'transacao' && b.tx).toMatchObject({ valor: -1080.92, desc: 'Supermercado', conta: 'flash' });
  });
  it('modelo "Pix de {desc}" sem nome não vira "Pix de"', () => {
    const r = proc(n(MP, 'Pix recebido', 'Você recebeu R$ 5,00.'));
    expect(r.status === 'transacao' && r.tx.desc).toBe('Pix recebido');
  });
});

describe('regra automática (botão Adicionar)', () => {
  const d = dadosIniciais();
  it('Flash: pega valor e loja, e vale para o outro título (voucher)', () => {
    const r = gerarRegraAuto(FLASH_CRED, d)!;
    expect(r).toMatchObject({ acao: 'saida', sentido: 'sai', conta: 'flash', origem: 'automatica', pacote: FLASH });
    const res = processar(FLASH_VOUCHER, [r], d.contas);
    expect(res.status === 'transacao' && res.tx).toMatchObject({ valor: -1080.92, desc: 'Supermercado' });
  });
  it('Pix recebido: "que FULANO te transferiu" vira a descrição', () => {
    const r = gerarRegraAuto({ ...PIX, titulo: 'Você recebeu R$ 25', texto: 'O valor que Maria Souza te transferiu via Pix já está disponível.' }, d)!;
    expect(r).toMatchObject({ acao: 'entrada', conta: 'mercadopago-conta' });
    const res = processar(n(MP, 'Você recebeu R$ 3', 'O valor que João Lima te transferiu via Pix já está disponível.'), [r], d.contas);
    expect(res.status === 'transacao' && res.tx).toMatchObject({ valor: 3, desc: 'João Lima' });
  });
  it('compra no crédito vai para o cartão do banco', () => {
    const r = gerarRegraAuto(n(MP, 'Compra aprovada', 'Você comprou R$ 45,90 em LOJA X com seu cartão de crédito.'), d)!;
    expect(r.conta).toBe('mercadopago-cartao');
  });
  it('sem valor em R$ não cria regra', () => {
    expect(gerarRegraAuto(n(MP, 'Novidade', 'Conheça o novo cartão!'), d)).toBeNull();
  });
  it.each([
    ['Você recebeu R$ 10', 'entrada'], ['Compra de R$ 5,00 aprovada', 'saida'], ['Estorno de R$ 9,90', 'entrada'],
    ['Você depositou R$ 1,00', 'interna'], ['Você guardou R$ 50,00 na caixinha', 'caixinha'],
  ])('%s → %s', (t, a) => expect(acaoProvavel(t, false).acao).toBe(a));
});

describe('decisões dos avisos', () => {
  const novaNotif = (titulo: string, texto: string, chave: string) => ({ chave, pacote: FLASH, titulo, texto, quando });
  it('Adicionar cria a regra e a transação; as próximas parecidas já entram sozinhas', () => {
    let d: Dados = { ...dadosIniciais(), regras: dadosIniciais().regras.filter(r => r.pacote !== FLASH) };
    d = receber(d, [novaNotif('Compra aprovada no crédito', FLASH_CRED.texto, 'k1')]).dados;
    expect(d.notifs[0].status).toBe('sem-regra');
    const r = aplicarDecisoes(d, [{ chave: 'k1', acao: 'adicionar' }]);
    expect(r.resultados[0].ok).toBe(true);
    expect(r.dados.notifs[0].status).toBe('transacao');
    expect(r.dados.regras.filter(x => x.origem === 'automatica')).toHaveLength(1);
    const d2 = receber(r.dados, [novaNotif('Compra aprovada no voucher', FLASH_VOUCHER.texto, 'k2')]).dados;
    expect(d2.notifs.find(x => x.id === 'k2')!.status).toBe('transacao');
  });
  it('Ignorar sem regra cria regra de ignorar pelo título', () => {
    let d = receber(dadosIniciais(), [{ chave: 'p1', pacote: MP, titulo: 'Aproveite o cashback!', texto: 'Ganhe até R$ 50,00 de volta.', quando }]).dados;
    const antes = d.notifs[0].status;
    d = aplicarDecisoes(d, [{ chave: 'p1', acao: 'ignorar' }]).dados;
    expect([antes, d.notifs[0].status]).toEqual([antes, 'ignorada']);
    expect(d.txs).toHaveLength(0);
    const d2 = receber(d, [{ chave: 'p2', pacote: MP, titulo: 'Aproveite o cashback!', texto: 'Outra promoção de R$ 10,00.', quando }]).dados;
    expect(d2.notifs.find(x => x.id === 'p2')!.status).toBe('ignorada');
    expect(gerarRegraIgnorar(d.notifs[0], d).padrao).toBe('^Aproveite o cashback!\\n');
  });
  it('Ignorar o que já virou transação desfaz a transação', () => {
    let d = receber(dadosIniciais(), [novaNotif('Compra aprovada no crédito', FLASH_CRED.texto, 'k1')]).dados;
    expect(d.txs).toHaveLength(1);
    d = aplicarDecisoes(d, [{ chave: 'k1', acao: 'ignorar' }]).dados;
    expect(d.txs).toHaveLength(0);
    expect(d.notifs[0].status).toBe('ignorada');
  });
});

describe('migração v1 → v2', () => {
  it('adiciona Flash, regras novas, atualiza só as regras padrão não editadas e reprocessa as sem regra', () => {
    const v1 = sanear({}) as Dados;
    // Simula dados da v1: sem Flash, regras antigas, uma regra padrão editada e notificações reais sem regra.
    const antigas = v1.regras.filter(r => r.id in REGRAS_V1).map(r => ({ ...r, padrao: (REGRAS_V1 as Record<string, string>)[r.id] }));
    antigas.find(r => r.id === 'nu-compra')!.padrao = 'editada por mim (?<valor>\\d+)';
    let d: Dados = { ...v1, contas: v1.contas.filter(c => c.id !== 'flash'), apps: v1.apps.filter(a => a.pacote !== FLASH), regras: antigas,
      config: { ...v1.config, versaoDados: 1 } };
    d = receber(d, [{ chave: 'a', pacote: MP, titulo: PIX.titulo, texto: PIX.texto, quando }, { chave: 'b', pacote: MP, titulo: DEPOSITO.titulo, texto: DEPOSITO.texto, quando }]).dados;
    expect(d.notifs.map(x => x.status)).toEqual(['sem-regra', 'sem-regra']);
    const m = migrar(d);
    expect(m.migrou).toBe(true);
    expect(m.dados.config.versaoDados).toBe(2);
    expect(m.dados.contas.some(c => c.id === 'flash')).toBe(true);
    expect(m.dados.apps.find(a => a.pacote === FLASH)).toMatchObject({ conta: 'flash' });
    expect(m.dados.regras.map(r => r.id)).toEqual(expect.arrayContaining(['flash-compra', 'mp-deposito', 'nu-transferencia-sua']));
    expect(m.dados.regras.find(r => r.id === 'nu-compra')!.padrao).toBe('editada por mim (?<valor>\\d+)');
    expect(m.dados.notifs.map(x => x.status)).toEqual(['transacao', 'transacao']);
    expect(migrar(m.dados).migrou).toBe(false);
  });
});

describe('categorias com as descrições reais', () => {
  it.each([
    ['CAFE CENTRAL EMPORIO BRA', 'Alimentação'], ['DOCERIA BELA VISTA BRA', 'Alimentação'], ['LOJA XYZ BRA', null], ['PAPELARIA CENTRO', 'Compras'],
    ['PETZ SHOPPING', 'Compras'], ['Pagamento com Pix RAIZEN SOL', 'Transporte'], ['Google Youtube', 'Assinaturas'],
  ])('%s → %s', async (d, c) => {
    const { indicePalavras } = await import('../src/core/classificar');
    const { CATEGORIAS_INICIAIS } = await import('../src/core/padroes');
    expect(indicePalavras(CATEGORIAS_INICIAIS)(d, false)).toBe(c);
  });
});

describe('Pix do Itaú (salário) com regra de categoria', () => {
  it('extrato, notificação e Pix com mesmo valor saindo de outra conta: continua entrada/Salário', async () => {
    const { classificar, resumoMes } = await import('../src/core/classificar');
    const { CATEGORIAS_INICIAIS, CONTAS_INICIAIS } = await import('../src/core/padroes');
    const { norm } = await import('../src/core/util');
    const regrasCat = [{ id: 'r', termo: norm('Itau Unibanco').trim(), tipo: 'entrada' as const, cat: 'Salário' }];
    const t = (id: string, conta: string, desc: string, valor: number, extra = {}) => ({ id, conta, data: '2026-09-25', desc, valor, origens: [], criadoEm: '', ...extra });
    const cls = classificar([
      t('a', 'mercadopago-conta', 'Pix recebido Itau Unibanco S.A', 136.04),
      t('b', 'mercadopago-conta', 'Pix de Itau Unibanco S.A.', 2500, { tipo: 'interna' }), // ex.: notificação de "depósito"
      t('c', 'mercadopago-conta', 'Pix recebido Itau Unibanco S.A', 300),
      t('d', 'flash', 'Transferência enviada', -300), // mesmo valor saindo de outra conta: não vira "interna"
    ], { contas: CONTAS_INICIAIS, categorias: CATEGORIAS_INICIAIS, regrasCat, titular: 'Itau Unibanco' });
    expect(cls.slice(0, 3).map(x => [x.t, x.c])).toEqual([['entrada', 'Salário'], ['entrada', 'Salário'], ['entrada', 'Salário']]);
    expect(resumoMes(cls, '2026-09').entradasPorCategoria[0]).toMatchObject({ cat: 'Salário', v: 2936.04 });
  });
});
