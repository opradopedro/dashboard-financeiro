// Botões do aviso do Android (e da tela da notificação):
// - Adicionar: cria sozinho uma regra a partir do texto da notificação e a transforma em transação.
// - Ignorar: a notificação não vira transação; se ela não tinha regra, cria uma regra de ignorar
//   para as próximas com o mesmo título (é assim que as propagandas param de perguntar).
import type { AcaoRegra, Conta, Dados, Notificacao, RegraNotif } from './tipos';
import { V } from './padroes';
import { aplicarRegra, escRe, textoNotif } from './regras';
import { reprocessar } from './ingestao';
import { norm, uid } from './util';

/** Literal da notificação como padrão: escapa e deixa os números variáveis. */
const literal = (s: string) => escRe(s).replace(/\d+/g, '\\d+').replace(/\s+/g, '\\s+');

// Onde termina o nome da loja/pessoa depois de "em", "para", "de"…
const FIM_DESC = /\s+(?:realizad[ao]s?|aprovad[ao]s?|para o cart[aã]o|com (?:seu|sua|o|a)\b|via\b|foi\b|j[aá]\b|no cart[aã]o|no valor|no d[eé]bito|no cr[eé]dito)|[.\n]|$/i;

/** O que a notificação parece ser, pelas palavras. */
export function acaoProvavel(texto: string, cartao: boolean): { acao: AcaoRegra; sentido: 'sai' | 'entra' } {
  const t = norm(texto);
  if (/ (estorn|reembols|devolv)/.test(t)) return cartao ? { acao: 'saida', sentido: 'entra' } : { acao: 'entrada', sentido: 'entra' };
  if (/ (voce depositou|deposito|depositado)/.test(t)) return { acao: 'interna', sentido: 'entra' };
  if (/ (guardou|guardado|reservou|reservado|caixinha|cofrinho)/.test(t)) return { acao: 'caixinha', sentido: 'sai' };
  if (/ pagamento (da |de )?fatura| fatura (paga|foi paga)/.test(t)) return { acao: 'fatura', sentido: cartao ? 'entra' : 'sai' };
  if (/ (compra|pagamento|pagou|enviou|enviado|enviamos|saque|cobranca|debitad|voce transferiu)/.test(t)) return { acao: 'saida', sentido: 'sai' };
  if (/ (recebeu|recebido|recebemos|caiu|entrou|te transferiu|te enviou|rendeu|rendimento|cashback)/.test(t)) return { acao: 'entrada', sentido: 'entra' };
  return { acao: 'saida', sentido: 'sai' };
}

/** Conta para a regra automática: a do app (se definida) ou a do banco com o mesmo nome do app. */
export function contaProvavel(pacote: string, texto: string, d: Pick<Dados, 'contas' | 'apps'>): Conta | null {
  const ativas = d.contas.filter(c => c.ativa);
  const app = d.apps.find(a => a.pacote === pacote);
  const fixa = app?.conta && d.contas.find(c => c.id === app.conta);
  if (fixa) return fixa;
  const nomeApp = norm(app?.nome || '').trim().split(' ')[0];
  const doBanco = nomeApp ? ativas.filter(c => norm(c.banco).includes(` ${nomeApp}`) || norm(c.nome).includes(` ${nomeApp}`)) : [];
  if (doBanco.length) {
    const credito = / (credito|cartao)/.test(norm(texto));
    return doBanco.find(c => c.tipo === (credito ? 'cartao' : 'corrente')) || doBanco[0];
  }
  return ativas[0] || null;
}

/**
 * Monta uma regra a partir de uma notificação real: o trecho antes do valor fica fixo, o valor
 * vira o grupo valor, o nome depois de "em/para/de" (ou "que FULANO te transferiu") vira desc.
 * Devolve null se não houver valor em R$ no texto.
 */
export function gerarRegraAuto(n: Notificacao, d: Pick<Dados, 'contas' | 'apps'>, agora = new Date()): RegraNotif | null {
  const T = textoNotif(n);
  const mv = /R\$\s?\d[\d.]*(?:,\d{2})?/.exec(T);
  if (!mv) return null;
  const conta = contaProvavel(n.pacote, T, d);
  if (!conta) return null;
  const { acao, sentido } = acaoProvavel(T, conta.tipo === 'cartao');
  const iniLinha = T.lastIndexOf('\n', mv.index) + 1;
  // Trecho fixo antes do valor (até 40 letras, começando numa palavra inteira).
  let antes = T.slice(iniLinha, mv.index);
  if (antes.length > 40) antes = antes.slice(antes.length - 40).replace(/^\S*\s/, '');
  const depois = T.slice(mv.index + mv[0].length);
  let desc = '';
  const md = /^([^\n]*?\s(?:em|no|na|para|de)\s+)(?=\S)/i.exec(depois);
  const mq = /\bque\s+(.+?)\s+te\s+(transferiu|enviou|pagou|mandou)\b/i.exec(depois);
  if (md) {
    const resto = depois.slice(md[0].length);
    const fim = FIM_DESC.exec(resto);
    const term = fim && fim[0].trim() && /^\s+\S/.test(fim[0]) ? `\\s+${literal(fim[0].trim())}` : '';
    desc = `${literal(md[1])}(?<desc>[^\\n]+?)(?:${term ? term + '|' : ''}\\.|\\n|$)`;
  } else if (mq) {
    desc = `[\\s\\S]*?\\bque\\s+(?<desc>[^.\\n]+?)\\s+te\\s+${mq[2]}`;
  }
  const base = `${literal(antes)}${V}`;
  const regra: RegraNotif = {
    id: uid('ra'), nome: `${d.apps.find(a => a.pacote === n.pacote)?.nome || n.pacote}: ${n.titulo || 'notificação'}`.slice(0, 70),
    pacote: n.pacote, padrao: base + desc, descricao: '', acao, sentido, conta: conta.id, prioridade: 60, ativa: true,
    origem: 'automatica', criadaEm: agora.toISOString(),
  };
  // Confere com a própria notificação; se o trecho da descrição atrapalhar, fica só com o valor.
  if (aplicarRegra(regra, n)?.status === 'transacao') return regra;
  const simples = { ...regra, padrao: base };
  return aplicarRegra(simples, n)?.status === 'transacao' ? simples : null;
}

/** Regra para ignorar as próximas notificações com o mesmo título (ou o mesmo começo de texto). */
export function gerarRegraIgnorar(n: Notificacao, d: Pick<Dados, 'apps' | 'contas'>, agora = new Date()): RegraNotif {
  const titulo = n.titulo.trim();
  const padrao = titulo ? `^${escRe(titulo)}\\n` : `^\\n${escRe(n.texto.trim().slice(0, 40))}`;
  return {
    id: uid('ri'), nome: `Ignorar: ${titulo || n.texto.slice(0, 40)}`.slice(0, 70), pacote: n.pacote, padrao, descricao: '',
    acao: 'ignorar', sentido: 'sai', conta: d.contas[0]?.id || '', prioridade: 70, ativa: true, origem: 'automatica', criadaEm: agora.toISOString(),
  };
}

export type AcaoAviso = 'adicionar' | 'ignorar';
export interface Decisao { chave: string; acao: AcaoAviso }

/** Resultado de uma decisão, para mostrar ao usuário. */
export interface ResultadoDecisao { chave: string; acao: AcaoAviso; ok: boolean; msg: string }

/** Aplica as decisões tomadas nos avisos (ou na tela da notificação). Não altera os dados recebidos. */
export function aplicarDecisoes(d0: Dados, decisoes: Decisao[], agora = new Date()): { dados: Dados; resultados: ResultadoDecisao[] } {
  let d = d0;
  const resultados: ResultadoDecisao[] = [];
  for (const dec of decisoes) {
    const n = d.notifs.find(x => x.id === dec.chave);
    if (!n) { resultados.push({ ...dec, ok: false, msg: 'Notificação não encontrada.' }); continue; }
    if (dec.acao === 'adicionar') {
      if (n.status === 'transacao') { resultados.push({ ...dec, ok: true, msg: 'Já era uma transação.' }); continue; }
      const regra = gerarRegraAuto(n, d, agora);
      if (!regra) { resultados.push({ ...dec, ok: false, msg: 'Não achei um valor em R$ nesta notificação; crie a regra à mão.' }); continue; }
      d = { ...d, regras: [...d.regras, regra] };
      // Vale para esta e para as outras do mesmo app que estavam sem regra.
      const pend = d.notifs.filter(x => x.pacote === n.pacote && (x.id === n.id || x.status === 'sem-regra' || x.status === 'erro')).map(x => x.id);
      d = reprocessar(d, pend);
      const st = d.notifs.find(x => x.id === n.id)?.status;
      resultados.push({ ...dec, ok: st === 'transacao', msg: st === 'transacao' ? `Regra “${regra.nome}” criada.` : 'A regra foi criada, mas outra regra de prioridade maior decidiu esta notificação.' });
    } else {
      if (n.status === 'transacao' && n.tx) {
        // Já tinha virado transação: desfaz (só se ela veio apenas desta notificação).
        const t = d.txs.find(x => x.id === n.tx);
        const so = t && t.origens.every(o => o.tipo === 'notificacao' && o.ref === n.id);
        d = { ...d, txs: so ? d.txs.filter(x => x !== t) : d.txs.map(x => (x === t ? { ...x, origens: x.origens.filter(o => o.ref !== n.id) } : x)),
          notifs: d.notifs.map(x => (x.id === n.id ? { ...x, status: 'ignorada' as const, tx: undefined } : x)) };
        resultados.push({ ...dec, ok: true, msg: 'Transação desfeita.' });
      } else {
        const regra = gerarRegraIgnorar(n, d, agora);
        d = { ...d, regras: [...d.regras, regra] };
        d = reprocessar(d, d.notifs.filter(x => x.pacote === n.pacote && (x.id === n.id || x.status === 'sem-regra' || x.status === 'erro')).map(x => x.id));
        resultados.push({ ...dec, ok: true, msg: 'As próximas com este título serão ignoradas.' });
      }
    }
  }
  return { dados: d, resultados };
}
