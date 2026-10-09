import { describe, expect, it } from 'vitest';
import { aplicarRegra, dataDaNotif, processar, sugerirPadrao, compilar } from '../src/core/regras';
import { CONTAS_INICIAIS, REGRAS_INICIAIS } from '../src/core/padroes';
import type { RegraNotif } from '../src/core/tipos';

const quando = new Date(2026, 9, 9, 14, 30).getTime(); // 09/10/2026 local
const n = (pacote: string, titulo: string, texto: string) => ({ pacote, titulo, texto, quando });
const MP = 'com.mercadopago.wallet', NU = 'com.nu.production', RICO = 'br.com.rico.mobile';
const proc = (p: string, t: string, x: string) => processar(n(p, t, x), REGRAS_INICIAIS, CONTAS_INICIAIS);

describe('regra: grupos, valor, sinal e descrição', () => {
  const r: RegraNotif = { id: 'r', nome: 'r', pacote: 'x', padrao: String.raw`Compra de R\$\s?(?<valor>[\d.]+,\d{2}) em (?<desc>.+?) em (?<data>\d{2}/\d{2})`,
    descricao: '', acao: 'saida', sentido: 'sai', conta: 'c', prioridade: 1, ativa: true, origem: 'manual', criadaEm: '' };
  it('extrai os grupos e aplica o sentido', () => {
    const res = aplicarRegra(r, n('x', 'Cartão', 'Compra de R$ 1.234,56 em LOJA  X em 07/10'));
    expect(res?.status).toBe('transacao');
    if (res?.status !== 'transacao') return;
    expect(res.tx).toEqual({ data: '2026-10-07', desc: 'LOJA X', valor: -1234.56, conta: 'c', tipo: 'saida' });
  });
  it('modelo de descrição com {grupo}', () => {
    const res = aplicarRegra({ ...r, descricao: 'Compra: {desc}' }, n('x', 't', 'Compra de R$ 5,00 em PADARIA em 09/10'));
    expect(res?.status === 'transacao' && res.tx.desc).toBe('Compra: PADARIA');
  });
  it('sem o grupo desc usa o título; sem data usa o dia da notificação', () => {
    const res = aplicarRegra({ ...r, padrao: String.raw`R\$ (?<valor>[\d.]+,\d{2})` }, n('x', 'Pix recebido', 'Você recebeu R$ 10,00'));
    expect(res?.status === 'transacao' && res.tx).toMatchObject({ desc: 'Pix recebido', data: '2026-10-09', valor: -10 });
  });
  it('não casou = null; regex inválida = erro', () => {
    expect(aplicarRegra(r, n('x', 'a', 'nada'))).toBeNull();
    expect(aplicarRegra({ ...r, padrao: '(' }, n('x', 'a', 'b'))?.status).toBe('erro');
    expect(() => compilar('[')).toThrow(/Expressão inválida/);
  });
  it('sem grupo valor = erro', () => {
    expect(aplicarRegra({ ...r, padrao: 'Compra' }, n('x', 'a', 'Compra'))?.status).toBe('erro');
  });
  it('data sem ano no futuro é do ano anterior', () => {
    expect(dataDaNotif('30/12', new Date(2027, 0, 2).getTime())).toBe('2026-12-30');
    expect(dataDaNotif('05/01/2027', quando)).toBe('2027-01-05');
  });
});

describe('prioridade, app e ativa', () => {
  const base: RegraNotif = { id: 'a', nome: 'a', pacote: 'p', padrao: String.raw`R\$ (?<valor>\d+,\d{2})`, acao: 'saida', sentido: 'sai', conta: 'nubank-cartao', prioridade: 1, ativa: true, origem: 'manual', criadaEm: '' };
  it('maior prioridade vence; inativa e de outro app não contam', () => {
    const regras = [base, { ...base, id: 'b', prioridade: 5, acao: 'entrada' as const, sentido: 'entra' as const }, { ...base, id: 'c', prioridade: 9, ativa: false }, { ...base, id: 'd', prioridade: 99, pacote: 'outro' }];
    const res = processar(n('p', 't', 'R$ 3,00'), regras, CONTAS_INICIAIS);
    expect(res.status === 'transacao' && [res.regra.id, res.tx.valor]).toEqual(['b', 3]);
  });
  it('regra quebrada não impede as outras', () => {
    const res = processar(n('p', 't', 'R$ 3,00'), [{ ...base, id: 'x', padrao: '(', prioridade: 9 }, base], CONTAS_INICIAIS);
    expect(res.status).toBe('transacao');
  });
  it('conta apagada vira erro', () => {
    expect(processar(n('p', 't', 'R$ 3,00'), [{ ...base, conta: 'sumiu' }], CONTAS_INICIAIS).status).toBe('erro');
  });
  it('nenhuma casou = sem regra', () => {
    expect(processar(n('p', 't', 'oi'), [base], CONTAS_INICIAIS).status).toBe('sem-regra');
  });
});

describe('regras iniciais (chute) com textos plausíveis', () => {
  it.each([
    [MP, 'Você recebeu um Pix', 'Você recebeu R$ 150,00 de Fulano de Tal.', 'mercadopago-conta', 150, 'entrada'],
    [MP, 'Pix enviado', 'Você enviou R$ 42,50 para Padaria Pão Bom.', 'mercadopago-conta', -42.5, 'saida'],
    [MP, 'Dinheiro reservado', 'Você reservou R$ 300,00 na sua reserva.', 'mercadopago-conta', -300, 'caixinha'],
    [MP, 'Dinheiro retirado', 'Você retirou R$ 80,00 da sua reserva.', 'mercadopago-conta', 80, 'caixinha'],
    [MP, 'Compra aprovada', 'Você fez uma compra de R$ 25,90 em UBER *TRIP com seu cartão de crédito.', 'mercadopago-cartao', -25.9, 'saida'],
    [MP, 'Pagamento aprovado', 'Seu pagamento de R$ 12,00 em LANCHONETE X foi aprovado.', 'mercadopago-conta', -12, 'saida'],
    [MP, 'Fatura paga', 'Você pagou R$ 1.200,00 da fatura do seu cartão.', 'mercadopago-conta', -1200, 'fatura'],
    [NU, 'Compra aprovada', 'Compra de R$ 52,00 APROVADA em PADARIA X para o cartão com final 1234.', 'nubank-cartao', -52, 'saida'],
    [NU, 'Estorno', 'Estorno de R$ 19,90 em LOJA Y.', 'nubank-cartao', 19.9, 'saida'],
    [NU, 'Pagamento recebido', 'Recebemos o pagamento de R$ 900,00 da sua fatura.', 'nubank-cartao', 900, 'fatura'],
    [RICO, 'Compra aprovada', 'Compra de R$ 45,00 aprovada em FARMACIA Z no cartão Rico.', 'rico-cartao', -45, 'saida'],
  ])('%s: %s', (p, t, x, conta, valor, tipo) => {
    const r = proc(p, t, x);
    expect(r.status).toBe('transacao');
    if (r.status === 'transacao') expect(r.tx).toMatchObject({ conta, valor, tipo });
  });
  it('descrição da compra Nubank é a loja', () => {
    const r = proc(NU, 'Compra aprovada', 'Compra de R$ 52,00 APROVADA em PADARIA X para o cartão com final 1234.');
    expect(r.status === 'transacao' && r.tx.desc).toBe('PADARIA X');
  });
  it('investimentos da Rico são ignorados', () => {
    expect(proc(RICO, 'Aplicação realizada', 'Sua aplicação de R$ 1.000,00 no CDB foi realizada.').status).toBe('ignorada');
    expect(proc(RICO, 'Dividendos', 'Você recebeu R$ 12,30 em dividendos de ITSA4.').status).toBe('ignorada');
  });
});

describe('sugestão de padrão', () => {
  it('troca o valor pelo grupo e casa com o texto original', () => {
    const p = sugerirPadrao('Compra aprovada', 'Compra de R$ 52,00 em X (teste)');
    const m = compilar(p).exec('Compra aprovada\nCompra de R$ 99,10 em Y');
    expect(m?.groups?.valor).toBe('99,10');
  });
});
