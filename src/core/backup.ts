// Backup e restauração por arquivo: tudo do app num JSON. Também usado para validar o que vem do
// banco local (dados de versões antigas ganham os campos novos com os valores iniciais).
import type { Dados } from './tipos';
import { dadosIniciais, FILTRO_NOTIF_INICIAL, REGRAS_INICIAIS } from './padroes';
import { TIPOS } from './tipos';

export const APP_BACKUP = 'dashboard-financeiro';

export interface Backup { app: typeof APP_BACKUP; versao: 1; exportadoEm: string; dados: Dados }

export const montarBackup = (d: Dados, agora = new Date()): Backup => ({ app: APP_BACKUP, versao: 1, exportadoEm: agora.toISOString(), dados: d });

type Obj = Record<string, unknown>;
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as Obj[] : []);
const str = (v: unknown, def = '') => (typeof v === 'string' ? v : def);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const ehData = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const tipoOk = (v: unknown) => typeof v === 'string' && v in TIPOS;

/** Confere e completa os dados (campos que faltarem voltam ao valor inicial). */
export function sanear(x: unknown): Dados {
  const ini = dadosIniciais();
  if (!x || typeof x !== 'object') return ini;
  const o = x as Obj;
  const tem = (k: string) => Array.isArray(o[k]);
  const d: Dados = {
    contas: tem('contas') ? arr(o.contas).filter(c => typeof c.id === 'string' && (c.tipo === 'corrente' || c.tipo === 'cartao'))
      .map(c => ({ id: str(c.id), nome: str(c.nome, str(c.id)), banco: str(c.banco), tipo: c.tipo as 'corrente' | 'cartao', ativa: c.ativa !== false,
        ...(c.saldoRef && ehData((c.saldoRef as Obj).data) && Number.isFinite(num((c.saldoRef as Obj).valor))
          ? { saldoRef: { valor: num((c.saldoRef as Obj).valor), data: str((c.saldoRef as Obj).data) } } : {}) })) : ini.contas,
    txs: arr(o.txs).filter(t => typeof t.id === 'string' && typeof t.conta === 'string' && ehData(t.data) && Number.isFinite(num(t.valor)))
      .map(t => ({
        id: str(t.id), conta: str(t.conta), data: str(t.data), desc: str(t.desc), valor: num(t.valor),
        ...(tipoOk(t.tipo) ? { tipo: t.tipo as Dados['txs'][0]['tipo'] } : {}),
        ...(tipoOk(t.tipoUsuario) ? { tipoUsuario: t.tipoUsuario as Dados['txs'][0]['tipo'] } : {}),
        ...(typeof t.cat === 'string' ? { cat: t.cat } : {}),
        ...(typeof t.nota === 'string' && t.nota ? { nota: t.nota } : {}),
        ...(typeof t.reembolsa === 'string' ? { reembolsa: t.reembolsa } : {}),
        ...(t.semReembolso === true ? { semReembolso: true } : {}),
        origens: arr(t.origens).filter(g => g.tipo === 'notificacao' || g.tipo === 'manual' || g.tipo === 'extrato')
          .map(g => ({ tipo: g.tipo as 'manual', ref: str(g.ref), em: str(g.em), data: str(g.data), desc: str(g.desc), valor: Number(g.valor) || 0, ...(typeof g.arquivo === 'string' ? { arquivo: g.arquivo } : {}) })),
        criadoEm: str(t.criadoEm, new Date().toISOString()),
      })),
    notifs: arr(o.notifs).filter(n => typeof n.id === 'string' && typeof n.pacote === 'string' && Number.isFinite(num(n.quando)))
      .map(n => ({ id: str(n.id), pacote: str(n.pacote), titulo: str(n.titulo), texto: str(n.texto), quando: num(n.quando),
        status: (['transacao', 'ignorada', 'sem-regra', 'erro'].includes(str(n.status)) ? n.status : 'sem-regra') as Dados['notifs'][0]['status'],
        ...(typeof n.regra === 'string' ? { regra: n.regra } : {}), ...(typeof n.tx === 'string' ? { tx: n.tx } : {}),
        ...(typeof n.erro === 'string' ? { erro: n.erro } : {}), ...(n.simulada ? { simulada: true } : {}),
        ...(typeof n.filtro === 'string' && n.filtro ? { filtro: n.filtro } : {}) })),
    apps: tem('apps') ? arr(o.apps).filter(a => typeof a.pacote === 'string' && a.pacote)
      .map(a => ({ pacote: str(a.pacote).trim(), nome: str(a.nome, str(a.pacote)), ativo: a.ativo !== false,
        ...(typeof a.conta === 'string' && a.conta ? { conta: a.conta } : {}) })) : ini.apps,
    regras: tem('regras') ? arr(o.regras).filter(r => typeof r.id === 'string' && typeof r.padrao === 'string')
      .map(r => ({ id: str(r.id), nome: str(r.nome, 'Regra'), pacote: str(r.pacote), padrao: str(r.padrao), descricao: str(r.descricao),
        acao: (tipoOk(r.acao) || r.acao === 'ignorar' ? r.acao : 'saida') as Dados['regras'][0]['acao'],
        sentido: r.sentido === 'entra' ? 'entra' as const : 'sai' as const, conta: str(r.conta),
        prioridade: Number.isFinite(num(r.prioridade)) ? num(r.prioridade) : 0, ativa: r.ativa !== false,
        origem: (['padrao', 'manual', 'notificacao', 'automatica'].includes(str(r.origem)) ? r.origem
          : REGRAS_INICIAIS.some(x => x.id === r.id) ? 'padrao' : 'manual') as Dados['regras'][0]['origem'],
        criadaEm: str(r.criadaEm) })) : ini.regras,
    categorias: tem('categorias') ? arr(o.categorias).filter(c => typeof c.nome === 'string' && c.nome)
      .map(c => ({ nome: str(c.nome), receita: !!c.receita, palavras: Array.isArray(c.palavras) ? c.palavras.filter((p): p is string => typeof p === 'string') : [] })) : ini.categorias,
    regrasCat: arr(o.regrasCat).filter(r => typeof r.id === 'string' && typeof r.termo === 'string' && r.termo)
      .map(r => ({ id: str(r.id), termo: str(r.termo), ...(typeof r.cat === 'string' && r.cat ? { cat: r.cat } : {}), ...(tipoOk(r.tipo) ? { tipo: r.tipo as Dados['txs'][0]['tipo'] } : {}) })),
    modelos: arr(o.modelos).filter(m => typeof m.id === 'string' && typeof m.conta === 'string')
      .map(m => {
        const n = (k: string) => (Number.isInteger(m[k]) ? m[k] as number : -1);
        return { id: str(m.id), conta: str(m.conta), nome: str(m.nome, 'Modelo'), assinatura: str(m.assinatura), linhaCab: n('linhaCab'), colData: n('colData'),
          colDesc: n('colDesc'), colDesc2: n('colDesc2'), colValor: n('colValor'), colCredito: n('colCredito'), colDebito: n('colDebito'), colSaldo: n('colSaldo'), inverter: !!m.inverter,
          formatoData: (['auto', 'dmy', 'ymd', 'mdy'].includes(str(m.formatoData)) ? m.formatoData : 'auto') as 'auto' };
      }),
    revisoes: arr(o.revisoes).filter(r => typeof r.id === 'string' && r.linha && typeof r.linha === 'object' && Array.isArray(r.candidatos))
      .map(r => {
        const l = r.linha as Obj;
        return { id: str(r.id), linha: { conta: str(l.conta), data: str(l.data), desc: str(l.desc), valor: Number(l.valor) || 0, chave: str(l.chave),
          ...(typeof l.cat === 'string' && l.cat ? { cat: l.cat } : {}), ...(tipoOk(l.tipoUsuario) ? { tipoUsuario: l.tipoUsuario as Dados['txs'][0]['tipo'] } : {}) },
          candidatos: (r.candidatos as unknown[]).filter((c): c is string => typeof c === 'string'), arquivo: str(r.arquivo), em: str(r.em) };
      }).filter(r => ehData(r.linha.data) && r.linha.chave),
    importacoes: arr(o.importacoes).filter(i => typeof i.id === 'string')
      .map(i => ({ id: str(i.id), arquivo: str(i.arquivo), conta: str(i.conta), em: str(i.em), de: str(i.de), ate: str(i.ate),
        novas: Number(i.novas) || 0, unidas: Number(i.unidas) || 0, revisao: Number(i.revisao) || 0, repetidas: Number(i.repetidas) || 0 })),
    excluidas: Array.isArray(o.excluidas) ? o.excluidas.filter((k): k is string => typeof k === 'string') : [],
    filtros: arr(o.filtros).filter(f => typeof f.id === 'string' && typeof f.nome === 'string')
      .map(f => {
        const lista = (k: string) => (Array.isArray(f[k]) ? (f[k] as unknown[]).filter((v): v is string => typeof v === 'string') : []);
        return { id: str(f.id), nome: str(f.nome).slice(0, 60), contas: lista('contas'), formas: lista('formas'), cats: lista('cats') };
      }),
    config: (() => {
      const c = (o.config || {}) as Obj;
      return {
        boasVindasVista: !!c.boasVindasVista,
        titular: str(c.titular).slice(0, 120),
        avisos: (['sem-regra', 'todas', 'nunca'].includes(str(c.avisos)) ? c.avisos : 'sem-regra') as Dados['config']['avisos'],
        filtroNotif: (() => {
          const f = c.filtroNotif as Obj | undefined;
          if (!f || typeof f !== 'object') return { ...FILTRO_NOTIF_INICIAL, palavras: [...FILTRO_NOTIF_INICIAL.palavras] };
          const ps = Array.isArray(f.palavras) ? (f.palavras as unknown[]).filter((p): p is string => typeof p === 'string' && !!p.trim()).map(p => p.trim().slice(0, 60)) : [];
          return { exigirValor: f.exigirValor !== false, palavras: [...new Set(ps)].slice(0, 100) };
        })(),
        // Dados antigos (sem versão) são da versão 1; migracoes.ts leva até a atual.
        versaoDados: Number.isInteger(c.versaoDados) ? c.versaoDados as number : 1,
      };
    })(),
  };
  return d;
}

/** Lê um arquivo de backup. Lança erro com mensagem amigável se não servir. */
export function lerBackup(texto: string): Dados {
  let o: Obj;
  try { o = JSON.parse(texto); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  if (o?.app !== APP_BACKUP || !o.dados) {
    if (o?.formato === 'finai-banco/1') throw new Error('Este é um arquivo finai-banco/1. Use Importar → Arquivo finai-banco/1.');
    throw new Error('Este arquivo não é um backup do Dashboard Financeiro.');
  }
  return sanear(o.dados);
}
