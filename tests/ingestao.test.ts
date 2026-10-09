import { describe, expect, it } from 'vitest';
import { receber, reprocessar } from '../src/core/ingestao';
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
