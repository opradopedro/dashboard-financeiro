import { describe, expect, it } from 'vitest';
import { receber, reprocessar } from '../src/core/ingestao';
import { filtrarNotif, motivoFiltro } from '../src/core/regras';
import { migrar } from '../src/core/migracoes';
import { dadosIniciais } from '../src/core/padroes';
import { importarLinhas, chavesDasLinhas } from '../src/core/juntar';
import type { Dados } from '../src/core/tipos';

const quando = new Date(2026, 9, 9, 10).getTime();
const item = (chave: string, pacote: string, titulo: string, texto: string) => ({ chave, pacote, titulo, texto, quando });

describe('notificação → transação', () => {
  it('cria transação, registra e não processa a mesma duas vezes', () => {
    const d0 = dadosIniciais();
    const it1 = item('k1', 'com.nu.production', 'Compra aprovada', 'Compra de R$ 52,00 APROVADA em PADARIA X para o cartão com final 1234.');
    const r = receber(d0, [it1]);
    expect(r.novas).toHaveLength(1);
    expect(r.dados.txs).toHaveLength(1);
    expect(r.dados.notifs[0]).toMatchObject({ status: 'transacao', regra: 'nu-compra', tx: r.dados.txs[0].id });
    const r2 = receber(r.dados, [it1]);
    expect(r2.novas).toHaveLength(0);
    expect(r2.dados.txs).toHaveLength(1);
  });
  it('app não monitorado é descartado sem gravar', () => {
    const r = receber(dadosIniciais(), [item('k', 'com.whatsapp', 'Oi', 'R$ 10,00')]);
    expect(r.dados.notifs).toHaveLength(0);
    const d = dadosIniciais(); d.apps[1].ativo = false;
    expect(receber(d, [item('k', 'com.nu.production', 'Compra', 'Compra de R$ 1,00 APROVADA em X.')]).dados.notifs).toHaveLength(0);
  });
  it('sem regra fica registrada; reprocessar depois de criar a regra vira transação mantendo sua categoria', () => {
    let d: Dados = receber(dadosIniciais(), [item('k', 'com.nu.production', 'Novidade', 'Pagamento de boleto R$ 99,00 agendado')]).dados;
    expect(d.notifs[0].status).toBe('sem-regra');
    d = { ...d, regras: [...d.regras, { id: 'nova', nome: 'boleto', pacote: 'com.nu.production', padrao: String.raw`boleto R\$ (?<valor>[\d.]+,\d{2})`, acao: 'saida', sentido: 'sai', conta: 'nubank-cartao', prioridade: 1, ativa: true, origem: 'manual' as const, criadaEm: '' }] };
    d = reprocessar(d, ['k']);
    expect(d.notifs[0].status).toBe('transacao');
    const id = d.txs[0].id;
    d = { ...d, txs: d.txs.map(t => ({ ...t, cat: 'Moradia' })) };
    d = reprocessar(d, ['k']);
    expect(d.txs).toHaveLength(1);
    expect(d.txs[0]).toMatchObject({ id, cat: 'Moradia' });
    expect(d.notifs[0].tx).toBe(id);
  });
  it('notificação que chega depois do extrato é ligada à transação do extrato', () => {
    const d0 = dadosIniciais();
    const imp = importarLinhas(d0, chavesDasLinhas('nubank-cartao', [{ data: '2026-10-09', desc: 'PADARIA X LTDA', valor: -52 }]), 'f');
    const d1 = { ...d0, txs: imp.txs };
    const r = receber(d1, [item('k', 'com.nu.production', 'Compra aprovada', 'Compra de R$ 52,00 APROVADA em PADARIA X para o cartão com final 1234.')]);
    expect(r.dados.txs).toHaveLength(1);
    expect(r.dados.txs[0].desc).toBe('PADARIA X LTDA');
    expect(r.dados.txs[0].origens.map(o => o.tipo)).toEqual(['extrato', 'notificacao']);
  });
});

describe('filtro antes das regras (Ajustes → Avançado)', () => {
  const promo = item('p1', 'br.com.rico.mobile', '⭐10/10 com Cartão Rico⭐', 'Ofertas turbinadas em grandes parceiros, somente neste fim de semana, confira e aproveite antes que termine!');
  it('sem valor ($ ou reais) é ignorada pelo filtro e não vira pendência', () => {
    const r = receber(dadosIniciais(), [promo]);
    expect(r.dados.notifs[0]).toMatchObject({ status: 'ignorada', filtro: 'valor' });
    expect(r.dados.notifs[0].regra).toBeUndefined();
    expect(filtrarNotif({ titulo: 'Pix', texto: 'Você recebeu 50 reais de Fulano' }, dadosIniciais().config.filtroNotif)).toBeNull();
    expect(filtrarNotif({ titulo: 'Compra', texto: 'US$ 12,00 em LOJA' }, dadosIniciais().config.filtroNotif)).toBeNull();
  });
  it('empréstimo é sempre ignorado, mesmo com valor e regra (com ou sem acento)', () => {
    const r = receber(dadosIniciais(), [item('e1', 'com.nu.production', 'Empréstimo', 'Você tem R$ 5.000,00 de empréstimo pré-aprovado'),
      item('e2', 'com.nu.production', 'Oferta', 'Compra de R$ 52,00 APROVADA em EMPRESTIMOS X.')]);
    expect(r.dados.notifs.map(n => [n.status, n.filtro])).toEqual([['ignorada', 'palavra:empréstimo'], ['ignorada', 'palavra:empréstimo']]);
    expect(r.dados.txs).toHaveLength(0);
    expect(motivoFiltro('palavra:empréstimo')).toBe('tem “empréstimo”');
  });
  it('desligado: volta a passar pelas regras; reprocessar tira a marca do filtro', () => {
    let d = receber(dadosIniciais(), [promo]).dados;
    d = { ...d, config: { ...d.config, filtroNotif: { exigirValor: false, palavras: [] } } };
    d = reprocessar(d, ['p1']);
    expect(d.notifs[0].status).toBe('sem-regra');
    expect(d.notifs[0].filtro).toBeUndefined();
  });
  it('ao atualizar (dados v4), as propagandas que estavam sem regra passam pelo filtro', () => {
    const d0 = dadosIniciais();
    d0.config.versaoDados = 4;
    d0.notifs = [{ id: 'p1', pacote: 'br.com.rico.mobile', titulo: promo.titulo, texto: promo.texto, quando, status: 'sem-regra' }];
    const m = migrar(d0);
    expect(m.dados.notifs[0]).toMatchObject({ status: 'ignorada', filtro: 'valor' });
  });
});
