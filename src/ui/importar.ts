// Importação de extratos (PDF, CSV, Excel, OFX e finai-banco/1), um ou vários arquivos de uma vez,
// com a instituição reconhecida pelo formato; revisão de casos duvidosos e conferência mensal.
import { classificadas, classificarAvulsas, editarTxs, excluirTxs, mudar, nomeConta, state } from '../app';
import { aplicarEdicoes, chavesDasLinhas, conferencia, desfazerImportacoes, edicoesVazias, importarLinhas, resolverRevisao, saldoMaisRecente, txsDaImportacao, type Edicoes, type LinhaBruta } from '../core/juntar';
import { itensPdf, lerExtratoPdf, type ExtratoPdf } from '../importar/pdf';
import { lerFinai, linhasFinai, type LidoFinai } from '../core/finai';
import type { Conta, Importacao, Mapeamento, LinhaExtrato, Transacao } from '../core/tipos';
import { hoje, slug, somaMes, uid } from '../core/util';
import { lerCsv } from '../importar/csv';
import { checarImportacao, temAviso, type AvisoImportacao } from '../core/duplicadas';
import { contaDaFonte, detectarFonte, type ArquivoLido, type Fonte } from '../importar/detectar';
import { aplicarMapeamento, assinatura, modeloPara, sugerirMapeamento } from '../importar/mapear';
import { lerOfx, type Ofx } from '../importar/ofx';
import { lerPlanilha, type Celula } from '../importar/planilha';
import { decodificar } from '../importar/texto';
import { $, brl, esc, fmtD, fmtQuando, mesLongo, opcoes, sinal, toast } from './fmt';
import { confirmar } from './escolher';
import { editorLinhas, resumoLinhas, type LinhaVis } from './linhas';
import { linhaTx } from './transacoes';
import { trocar, voltar, type Rota } from './nav';

interface Sessao {
  arquivo: string;
  tipo: 'tabela' | 'ofx' | 'finai' | 'pdf';
  pdf?: ExtratoPdf;
  conta: string;            // '' = ainda não escolhida
  fonte?: Fonte | null;     // instituição reconhecida
  rows?: Celula[][];
  abas?: string[];
  aba?: string;
  lerAba?: (a: string) => Celula[][];
  map?: Mapeamento;
  modelo?: string;          // id do modelo aplicado
  ofx?: Ofx;
  inverter?: boolean;
  finai?: LidoFinai;
  destino?: Record<string, string>; // conta do arquivo → conta do app ('' = criar)
  erro?: string;
  resultado?: Importacao[];
  ed?: Edicoes;             // mudanças nas linhas antes de importar
  sel?: Set<string>;        // linhas marcadas na pré-visualização
}
/** Arquivos escolhidos (um ou vários), o aberto em detalhe (-1 = lista) e o resumo final. */
let lote: Sessao[] = [];
let aberto = -1;
let resumo: Sessao[] | null = null;
let ocupado = false;
let pulados: string[] = []; // repetidos deixados de fora no último "Importar novos"


const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nomeCol = (i: number) => (i < 26 ? COLS[i] : 'A' + COLS[i - 26]);

export function telaImportar(el: HTMLElement) {
  const d = state.dados;
  el.innerHTML = `<section class="panel">
    <p class="sub">Extrato da conta ou fatura do cartão, em PDF do Mercado Pago, CSV, Excel, OFX ou finai-banco/1. Pode escolher vários arquivos de uma vez: o app reconhece o banco de cada um. Importar de novo o mesmo arquivo não duplica, e o que já tinha vindo por notificação ou à mão é unido à linha do extrato.</p>
    <div class="row"><label class="btn primary" for="iArq">Escolher arquivos<input type="file" id="iArq" multiple accept=".pdf,.csv,.txt,.xlsx,.xls,.ofx,.qfx,.json,application/pdf,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/x-ofx,*/*"></label>
      <button type="button" class="btn" data-ir="revisao">Revisão${d.revisoes.length ? ` (${d.revisoes.length})` : ''}</button>
      <button type="button" class="btn" data-ir="conferencia">Conferir mês</button></div>
  </section>
  <div id="iPasso"></div>
  <section class="panel" id="iJa"></section>`;

  ($('#iArq') as HTMLInputElement).onchange = async e => {
    const inp = e.target as HTMLInputElement;
    const arqs = Array.from(inp.files || []);
    inp.value = '';
    if (!arqs.length) return;
    // Lote novo: tira o que já foi importado ou deu erro.
    resumo = null; pulados = [];
    lote = lote.filter(x => !x.erro && !x.resultado);
    const p = document.getElementById('iPasso');
    if (p) p.innerHTML = `<section class="caixa"><div class="sub">Lendo ${arqs.length === 1 ? 'o arquivo' : `${arqs.length} arquivos`}…</div></section>`;
    for (const f of arqs) {
      const s = await abrirArquivo(f);
      // Mesmo arquivo escolhido de novo (e ainda não importado): fica a leitura nova.
      const i = lote.findIndex(x => x.arquivo === s.arquivo && !x.resultado);
      if (i >= 0) lote[i] = s; else lote.push(s);
    }
    aberto = lote.length === 1 ? 0 : -1;
    passo();
  };
  passo();
  desenharImportados();
}

// ---------- Já importados: toque abre; toque longo marca vários para remover ----------

let marcadas: Set<string> | null = null; // null = fora do modo de seleção
let ignorarClique = false;

const ICONE_MARCA = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function desenharImportados() {
  const el = document.getElementById('iJa');
  if (!el) return;
  const imps = [...state.dados.importacoes].reverse();
  const sel = marcadas;
  if (sel) for (const id of [...sel]) if (!imps.some(i => i.id === id)) sel.delete(id);
  const todas = !!sel && sel.size === imps.length && imps.length > 0;
  el.innerHTML = `<div class="row between"><h2>Já importados</h2>${imps.length && !sel ? '<button type="button" class="btn small danger" id="btnRemTudo">Remover tudo</button>' : ''}</div>
    ${sel ? `<div class="sel-barra">
        <div class="row between nowrap"><span class="sub">${sel.size ? `${sel.size === 1 ? '1 marcado' : `${sel.size} marcados`}` : 'Toque nos arquivos para marcar'}</span>
          <button type="button" class="btn small" id="impTodos">${todas ? 'Desmarcar todos' : 'Marcar todos'}</button></div>
        <div class="sel-acoes"><button type="button" class="btn small danger" id="impRemover"${sel.size ? '' : ' disabled'}>Remover</button>
          <button type="button" class="btn small" id="impCancelar">Cancelar</button></div>
      </div>`
      : imps.length ? '<p class="note">Toque num arquivo para ver as linhas. Toque e segure para marcar um ou mais e remover.</p>' : ''}
    <div class="folha"><div class="list">${imps.map(i => `<button type="button" class="item imp${sel?.has(i.id) ? ' marcada' : ''}" data-imp="${esc(i.id)}"${sel ? ` aria-pressed="${sel.has(i.id)}"` : ''}>
      <div class="name">${sel ? `<span class="imp-check">${sel.has(i.id) ? ICONE_MARCA : ''}</span>` : ''}${esc(i.arquivo)}</div><div class="val sub">${fmtQuando(Date.parse(i.em))}</div>
      <div class="meta">${esc(nomeConta(i.conta))}, de ${fmtD(i.de)} a ${fmtD(i.ate)}</div>
      <div class="meta r">${resumoImp([i])}</div></button>`).join('') || '<div class="empty">Nenhum arquivo importado ainda.</div>'}</div></div>`;

  el.querySelectorAll<HTMLButtonElement>('[data-imp]').forEach(b => {
    const id = b.dataset.imp!;
    let timer = 0, x0 = 0, y0 = 0;
    const parar = () => { clearTimeout(timer); timer = 0; };
    b.addEventListener('pointerdown', e => {
      x0 = e.clientX; y0 = e.clientY;
      parar();
      timer = window.setTimeout(() => {
        timer = 0;
        ignorarClique = true;
        if (!marcadas) marcadas = new Set();
        marcadas.add(id);
        desenharImportados();
      }, 450);
    });
    b.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) parar(); });
    b.addEventListener('pointerup', parar);
    b.addEventListener('pointercancel', parar);
    b.addEventListener('pointerleave', parar);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.onclick = () => {
      if (ignorarClique) { ignorarClique = false; return; }
      if (!marcadas) { location.hash = '#/importacao/' + encodeURIComponent(id); return; }
      if (marcadas.has(id)) marcadas.delete(id); else marcadas.add(id);
      desenharImportados();
    };
  });
  // O toque longo pode terminar fora do item: o clique seguinte já não é dele.
  el.addEventListener('pointerdown', () => { ignorarClique = false; }, { capture: true, once: true });
  $('#impTodos')?.addEventListener('click', () => { marcadas = todas ? new Set() : new Set(imps.map(i => i.id)); desenharImportados(); });
  $('#impCancelar')?.addEventListener('click', () => { marcadas = null; desenharImportados(); });
  $('#impRemover')?.addEventListener('click', () => void removerImportacoes([...(marcadas || [])]));
  $('#btnRemTudo')?.addEventListener('click', () => void removerImportacoes(imps.map(i => i.id), true));
}

/** Desfaz as importações escolhidas, depois de confirmar. Devolve true se removeu. */
async function removerImportacoes(ids: string[], tudo = false): Promise<boolean> {
  if (!ids.length) return false;
  const prev = desfazerImportacoes(state.dados, ids);
  const n = ids.length === 1 ? 'esta importação' : `${ids.length} importações`;
  const partes = [
    prev.removidas ? `${prev.removidas === 1 ? '1 transação que veio só do arquivo sai' : `${prev.removidas} transações que vieram só ${ids.length === 1 ? 'do arquivo' : 'dos arquivos'} saem`} do app.` : '',
    prev.restauradas ? `${prev.restauradas === 1 ? '1 transação que já existia' : `${prev.restauradas} transações que já existiam`} (por notificação ou à mão) ${prev.restauradas === 1 ? 'continua' : 'continuam'}, como ${prev.restauradas === 1 ? 'era' : 'eram'} antes do extrato.` : '',
    'Dá para importar de novo depois.',
  ].filter(Boolean).join(' ');
  const ok = await confirmar(tudo ? 'Remover todas as importações?' : `Remover ${n}?`, partes, { sim: 'Remover', nao: 'Cancelar' });
  if (!ok) return false;
  await mudar(d => { const { removidas: _r, restauradas: _s, ...resto } = desfazerImportacoes(d, ids); return resto; });
  marcadas = null;
  selImp = { id: '', sel: new Set() };
  toast(ids.length === 1 ? 'Importação removida.' : `${ids.length} importações removidas.`);
  desenharImportados();
  return true;
}

/** Lê o arquivo, reconhece a instituição e escolhe a conta. Erros ficam na sessão. */
async function abrirArquivo(f: File): Promise<Sessao> {
  const s: Sessao = { arquivo: f.name, tipo: 'tabela', conta: '' };
  try {
    const lido = await ler(f, s);
    if (lido) {
      s.fonte = detectarFonte(lido, state.dados.modelos);
      s.conta = (s.fonte && contaDaFonte(s.fonte, state.dados.contas)) || '';
    }
    aplicarModelo(s);
  } catch (err) { s.erro = (err as Error).message; }
  return s;
}

async function ler(f: File, s: Sessao): Promise<ArquivoLido | null> {
  const buf = await f.arrayBuffer();
  const nome = f.name.toLowerCase();
  if (/\.pdf$/.test(nome) || new TextDecoder().decode(new Uint8Array(buf.slice(0, 5))) === '%PDF-') {
    const itens = await itensPdf(buf);
    s.tipo = 'pdf';
    s.pdf = lerExtratoPdf(itens);
    return { nome: f.name, textoPdf: itens.map(i => i.texto).join(' ') };
  }
  if (/\.(xlsx|xls|xlsm)$/.test(nome)) {
    const p = await lerPlanilha(buf);
    s.abas = p.abas; s.lerAba = p.ler; s.aba = p.abas[0];
    s.rows = p.ler(s.aba);
  } else {
    const texto = decodificar(buf);
    if (/\.(ofx|qfx)$/.test(nome) || /<OFX>/i.test(texto.slice(0, 4000))) {
      s.tipo = 'ofx'; s.ofx = lerOfx(texto);
      s.inverter = false;
      if (!s.ofx.linhas.length) throw new Error('Não achei transações neste OFX.');
      return { nome: f.name, ofx: { cartao: s.ofx.cartao, banco: s.ofx.banco, bankId: s.ofx.bankId } };
    }
    if (/\.json$/.test(nome) || /^\s*\{/.test(texto)) {
      s.tipo = 'finai'; s.finai = lerFinai(texto);
      s.destino = Object.fromEntries(s.finai.contas.map(c => [c.id, state.dados.contas.some(x => x.id === c.id) ? c.id : '']));
      return null;
    }
    s.rows = lerCsv(texto);
  }
  if (!s.rows?.length) throw new Error('O arquivo está vazio.');
  return { nome: f.name, rows: s.rows };
}

/** Fatura de cartão: a maioria das linhas são compras. Se vierem positivas, o sinal está trocado. */
const sinalTrocado = (l: LinhaBruta[]) => l.length > 0 && l.filter(x => x.valor > 0).length / l.length > 0.6;

/** Usa o modelo salvo da conta (mesmo cabeçalho) ou sugere o mapeamento; em cartão, acerta o sinal. */
function aplicarModelo(s: Sessao) {
  const cartao = state.dados.contas.find(c => c.id === s.conta)?.tipo === 'cartao';
  if (s.tipo === 'ofx' && s.ofx) { s.inverter = cartao && sinalTrocado(s.ofx.linhas); return; }
  if (s.tipo !== 'tabela' || !s.rows) return;
  s.modelo = undefined;
  const md = s.conta ? modeloPara(state.dados.modelos, s.conta, s.rows) : null;
  if (md) { s.map = { ...md }; s.modelo = md.id; } else s.map = sugerirMapeamento(s.rows);
  // Vale até com modelo salvo: um modelo gravado com o sinal errado não estraga as próximas faturas.
  if (cartao) s.map.inverter = sinalTrocado(aplicarMapeamento(s.rows, { ...s.map, inverter: false }).linhas);
}

/** Linhas prontas para importar (tabela com o mapeamento, OFX com a inversão, PDF como veio). */
function linhasDe(s: Sessao): LinhaBruta[] {
  if (s.tipo === 'tabela') return s.rows && s.map ? aplicarMapeamento(s.rows, s.map).linhas : [];
  if (s.tipo === 'ofx') return s.ofx!.linhas.map(l => ({ ...l, valor: s.inverter ? -l.valor : l.valor }));
  if (s.tipo === 'pdf') return s.pdf!.linhas;
  return [];
}

const pronta = (s: Sessao) => !s.erro && !s.resultado && (s.tipo === 'finai' || (!!s.conta && linhasDe(s).length > 0));

// ---------- Repetidos ----------

/** Linhas do arquivo como vão ser gravadas, para conferir se já existem. */
function linhasParaChecar(s: Sessao): LinhaExtrato[] {
  if (s.tipo === 'finai') {
    const f = s.finai!;
    return f.contas.flatMap(c => (s.destino![c.id] ? linhasFinai(s.destino![c.id], f.porConta.get(c.id) || []) : []));
  }
  return s.conta ? aplicarEdicoes(chavesDasLinhas(s.conta, linhasDe(s)), s.ed).linhas : [];
}

const avisoDe = (s: Sessao): AvisoImportacao => checarImportacao(state.dados, linhasParaChecar(s), s.arquivo);
const todasRepetidas = (a: AvisoImportacao) => a.total > 0 && a.conhecidas === a.total;

function textoAviso(a: AvisoImportacao) {
  const partes: string[] = [];
  if (todasRepetidas(a)) {
    const m = a.mesma;
    partes.push(m ? `Já existe uma importação exatamente como essa: “${m.arquivo}”, em ${nomeConta(m.conta)}, de ${fmtD(m.de)} a ${fmtD(m.ate)}, importada em ${fmtQuando(Date.parse(m.em))}. Importar de novo não adiciona nada.`
      : `Todas as ${a.total} linhas deste arquivo já foram importadas antes. Importar de novo não adiciona nada.`);
  } else if (a.conhecidas) partes.push(`${a.conhecidas === 1 ? '1 linha' : `${a.conhecidas} linhas`} de ${a.total} já ${a.conhecidas === 1 ? 'foi importada' : 'foram importadas'} antes e ${a.conhecidas === 1 ? 'vai ser pulada' : 'vão ser puladas'}.`);
  if (a.iguais) partes.push(`${a.iguais === 1 ? '1 linha é igual' : `${a.iguais} linhas são iguais`} (mesma conta, data e valor) a transações que vieram de outro extrato e ${a.iguais === 1 ? 'pode ficar duplicada' : 'podem ficar duplicadas'}.`);
  return partes.join(' ');
}

/**
 * Pergunta antes de importar arquivos que repetem o que já está no app. `soIguais`: só pergunta
 * pelas linhas iguais às de outro extrato (quem escolheu "Importar todos/novos" já viu o resto).
 */
async function podeImportar(ss: Sessao[], soIguais = false): Promise<boolean> {
  const com = ss.map(s => ({ s, a: avisoDe(s) })).map(x => (soIguais ? { ...x, a: { ...x.a, conhecidas: 0, mesma: null } } : x)).filter(x => temAviso(x.a));
  if (!com.length) return true;
  if (com.length === 1 && ss.length === 1) {
    const a = com[0].a;
    return confirmar(todasRepetidas(a) ? 'Importação repetida' : 'Linhas repetidas', `${textoAviso(a)} Deseja continuar?`, { sim: 'Importar mesmo assim' });
  }
  return confirmar('Arquivos com repetição', `${com.length === 1 ? 'Um arquivo repete' : `${com.length} arquivos repetem`} o que já está no app. Deseja continuar?`,
    { detalhes: com.map(x => `${x.s.arquivo}: ${textoAviso(x.a)}`), sim: 'Importar mesmo assim' });
}

function passo() {
  const el = document.getElementById('iPasso');
  if (!el) return;
  if (resumo) {
    el.innerHTML = painelResultado(resumo);
    $('#btnNovoArq').onclick = () => { lote = []; resumo = null; pulados = []; aberto = -1; passo(); };
    return;
  }
  if (!lote.length) { el.innerHTML = ''; return; }
  const s = aberto >= 0 ? lote[aberto] : null;
  if (!s) { passoLote(el); return; }
  if (s.erro) {
    el.innerHTML = `<section class="caixa"><h2>${esc(s.arquivo)}</h2><div class="err">${esc(s.erro)}</div></section>`;
    return;
  }
  if (s.tipo === 'tabela') passoTabela(el, s);
  else if (s.tipo === 'ofx') passoOfx(el, s);
  else if (s.tipo === 'pdf') passoPdf(el, s);
  else passoFinai(el, s);
}

/** Sai do detalhe: com um arquivo só, descarta; com vários, volta para a lista. */
function fechar() {
  if (lote.length <= 1) lote = [];
  aberto = -1;
  passo();
}

/** Depois de importar um arquivo pelo detalhe: resumo (se acabou o lote) ou volta para a lista. */
function terminouUm() {
  aberto = -1;
  if (lote.every(x => x.resultado || x.erro)) resumo = lote.filter(x => x.resultado);
  dispatchEvent(new Event('rerender')); // refaz a tela inteira (lista de já importados)
}

// ---------- Lista de arquivos ----------

const tipoConta = (t?: string) => (t === 'cartao' ? 'cartão' : 'conta');
const nomeNova = (f: Fonte) => `${f.banco} ${f.tipo === 'cartao' ? 'crédito' : 'conta'}`;

/** Instituição reconhecida (ou não) e o que falta para importar. */
function linhaFonte(s: Sessao, i: number) {
  if (s.tipo === 'finai') return `<div class="note">Backup finai-banco/1 com ${s.finai!.contas.length === 1 ? '1 conta' : `${s.finai!.contas.length} contas`}. Cada conta do arquivo entra na conta de mesmo código, ou numa conta nova.</div>`;
  const f = s.fonte;
  if (!f) return s.conta ? '' : `<div class="note">Não reconheci o banco deste arquivo. Escolha a conta.</div>`;
  if (s.conta) return `<div class="note">Reconhecido: ${esc(f.rotulo)}.</div>`;
  if (f.banco) return `<div class="note">Parece ${esc(f.rotulo)}, mas não há ${f.tipo ? tipoConta(f.tipo) + ' ' : 'conta '}${esc(f.banco)} no app.</div>
    <div class="row"><button type="button" class="btn small" data-criar="${i}">Criar “${esc(nomeNova(f))}”</button></div>`;
  return `<div class="note">Reconhecido: ${esc(f.rotulo)}. Escolha a conta.</div>`;
}

function seletorConta(s: Sessao, attr: string) {
  const contas = state.dados.contas.filter(c => c.ativa || c.id === s.conta);
  return `<select ${attr}>${opcoes([{ v: '', t: 'Escolha a conta' }, ...contas.map(c => ({ v: c.id, t: c.nome }))], s.conta)}</select>`;
}

function infoLinhas(s: Sessao) {
  if (s.tipo === 'finai') return `${[...s.finai!.porConta.values()].reduce((a, l) => a + l.length, 0)} transações`;
  const l = linhasDe(s);
  if (!l.length) return 'nenhuma linha reconhecida';
  const ds = l.map(x => x.data).sort();
  return `${l.length === 1 ? '1 linha' : `${l.length} linhas`}, de ${fmtD(ds[0])} a ${fmtD(ds[ds.length - 1])}`;
}

function passoLote(el: HTMLElement) {
  const prontas = lote.filter(pronta);
  // Arquivos em que todas as linhas já estão no app: "Importar novos" deixa de fora.
  const repetidos = prontas.filter(s => todasRepetidas(avisoDe(s)));
  const novos = prontas.filter(s => !repetidos.includes(s));
  const pendentes = lote.filter(s => !s.erro && !s.resultado && !pronta(s));
  el.innerHTML = `<section class="caixa">
    <h2>${lote.length} arquivos</h2>
    <div class="arqs">${lote.map((s, i) => `<div class="arq">
      <div class="arq-cab"><b>${esc(s.arquivo)}</b>${s.erro ? '' : `<span class="sub">${infoLinhas(s)}</span>`}</div>
      ${!s.erro && !s.resultado && (s.conta || s.tipo === 'finai') ? (a => (temAviso(a) ? `<div class="repetido">${esc(textoAviso(a))}</div>` : ''))(avisoDe(s)) : ''}
      ${s.erro ? `<div class="err">${esc(s.erro)}</div>`
        : s.resultado ? `<div class="ok">Importado em ${esc(s.resultado.map(r => nomeConta(r.conta)).join(', '))}: ${resumoImp(s.resultado)}.</div>`
        : `${linhaFonte(s, i)}
      <div class="arq-acoes">${s.tipo === 'finai' ? '' : seletorConta(s, `data-conta="${i}" aria-label="Conta de ${esc(s.arquivo)}"`)}
        <button type="button" class="btn small" data-ver="${i}">${s.tipo === 'tabela' ? 'Ver colunas' : 'Ver linhas'}</button></div>`}
      ${s.resultado ? '' : `<button type="button" class="tirar" data-tirar="${i}" aria-label="Tirar ${esc(s.arquivo)} da lista">Tirar da lista</button>`}
    </div>`).join('')}</div>
    ${pendentes.length ? `<div class="note">${pendentes.length === 1 ? 'Um arquivo precisa' : `${pendentes.length} arquivos precisam`} de conta ou de ajuste nas colunas antes de importar.</div>` : ''}
    <div class="row">${repetidos.length
      ? `<button type="button" class="btn primary" id="btnImpNovos"${novos.length && !ocupado ? '' : ' disabled'}>${ocupado ? 'Importando…' : !novos.length ? 'Nenhum arquivo novo' : novos.length === 1 ? 'Importar 1 novo' : `Importar ${novos.length} novos`}</button>
        <button type="button" class="btn" id="btnImpLote"${ocupado ? ' disabled' : ''}>Importar todos (${prontas.length})</button>`
      : `<button type="button" class="btn primary" id="btnImpLote"${prontas.length && !ocupado ? '' : ' disabled'}>${ocupado ? 'Importando…' : prontas.length === 1 ? 'Importar 1 arquivo' : `Importar ${prontas.length} arquivos`}</button>`}
      <button type="button" class="btn" id="btnLimpar">Cancelar</button></div>
    ${repetidos.length ? `<p class="note">${repetidos.length === 1 ? '1 arquivo já foi importado' : `${repetidos.length} arquivos já foram importados`} antes (todas as linhas). “Importar ${novos.length === 1 ? 'novo' : 'novos'}” deixa ${repetidos.length === 1 ? 'esse arquivo' : 'esses arquivos'} de fora; “Importar todos” inclui, mas as linhas repetidas são puladas.</p>` : ''}
  </section>`;
  el.querySelectorAll<HTMLSelectElement>('[data-conta]').forEach(x => (x.onchange = () => {
    const s = lote[Number(x.dataset.conta)];
    s.conta = x.value;
    aplicarModelo(s);
    passo();
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-ver]').forEach(b => (b.onclick = () => { aberto = Number(b.dataset.ver); passo(); scrollTo(0, 0); }));
  el.querySelectorAll<HTMLButtonElement>('[data-tirar]').forEach(b => (b.onclick = () => { lote.splice(Number(b.dataset.tirar), 1); aberto = lote.length === 1 ? 0 : -1; passo(); }));
  ligarCriar(el);
  $('#btnLimpar').onclick = () => { lote = []; aberto = -1; passo(); };
  $('#btnImpLote').onclick = () => void importarLote(prontas, []);
  $('#btnImpNovos')?.addEventListener('click', () => void importarLote(novos, repetidos));
}

/** Importa os arquivos escolhidos; os `deFora` (repetidos) saem da lista e entram no resumo. */
async function importarLote(ss: Sessao[], deFora: Sessao[]) {
  if (ocupado || !ss.length) return;
  if (!(await podeImportar(ss, true))) return;
  ocupado = true;
  passo();
  try {
    for (const s of ss) {
      if (s.tipo === 'finai') s.resultado = await importarFinai(s);
      else {
        s.resultado = [await importar(s.conta, linhasDe(s), s.arquivo, s.ed)];
        if (s.tipo === 'tabela') await salvarModelo(s);
      }
    }
  } catch (err) {
    toast(`Erro ao importar: ${(err as Error).message}`);
  } finally { ocupado = false; }
  lote = lote.filter(x => !deFora.includes(x));
  pulados = deFora.map(x => x.arquivo);
  if (lote.every(x => x.resultado || x.erro)) resumo = lote.filter(x => x.resultado);
  dispatchEvent(new Event('rerender'));
}

/** Botão "Criar conta" de uma instituição sem conta no app: cria e usa em todos os arquivos dela. */
function ligarCriar(el: HTMLElement) {
  el.querySelectorAll<HTMLButtonElement>('[data-criar]').forEach(b => (b.onclick = async () => {
    const f = lote[Number(b.dataset.criar)]?.fonte;
    if (!f?.banco) return;
    const tipo = f.tipo || 'corrente';
    const base = slug(`${f.banco}-${tipo === 'cartao' ? 'cartao' : 'conta'}`);
    let id = base;
    for (let n = 2; state.dados.contas.some(c => c.id === id); n++) id = `${base}-${n}`;
    const nova: Conta = { id, nome: nomeNova({ ...f, tipo }), banco: f.banco, tipo, ativa: true };
    await mudar(d => ({ ...d, contas: [...d.contas, nova] }));
    for (const s of lote) if (!s.conta && !s.resultado && s.fonte?.banco === f.banco && (s.fonte.tipo || 'corrente') === tipo) { s.conta = id; aplicarModelo(s); }
    toast(`Conta “${nova.nome}” criada.`);
    passo();
  }));
}

// ---------- Um arquivo em detalhe ----------

/** Cabeçalho do detalhe: nome, instituição reconhecida e a conta. */
function cabecalho(s: Sessao) {
  return `<div class="row between"><h2>${esc(s.arquivo)}</h2>${lote.length > 1 ? '<button type="button" class="btn small" id="btnLista">Voltar à lista</button>' : ''}</div>
    ${linhaFonte(s, aberto)}
    <div class="field"><label for="iConta">Conta do arquivo</label>${seletorConta(s, 'id="iConta"')}</div>
    ${s.conta ? (a => (temAviso(a) ? `<div class="repetido">${esc(textoAviso(a))}</div>` : ''))(avisoDe(s)) : ''}`;
}

function ligarCabecalho(el: HTMLElement, s: Sessao) {
  $('#iConta').onchange = () => { s.conta = ($('#iConta') as HTMLSelectElement).value; aplicarModelo(s); passo(); };
  $('#btnLista')?.addEventListener('click', () => { aberto = -1; passo(); });
  $('#btnCancelar').onclick = fechar;
  ligarCriar(el);
}

const botaoImportar = (s: Sessao, n: number) => `<button type="button" class="btn primary" id="btnImp"${n && s.conta ? '' : ' disabled'}>${s.conta ? `Importar ${n} linhas em ${esc(nomeConta(s.conta))}` : 'Escolha a conta para importar'}</button>`;
const botaoCancelar = () => `<button type="button" class="btn" id="btnCancelar">${lote.length > 1 ? 'Voltar' : 'Cancelar'}</button>`;

/** Linhas como vão entrar: sem as tiradas, com as mudanças e o tipo/categoria que o app vai dar. */
function visao(s: Sessao): { ls: LinhaVis[]; brutas: LinhaBruta[] } {
  const brutas = linhasDe(s);
  const ed = s.ed || edicoesVazias();
  const fora = new Set(ed.excluir), inv = new Set(ed.inverter);
  const txs: Transacao[] = [];
  brutas.forEach((l, i) => {
    if (fora.has(i)) return;
    txs.push({ id: String(i), conta: s.conta, data: l.data, desc: l.desc, valor: inv.has(i) ? -l.valor : l.valor, origens: [], criadoEm: '',
      ...(ed.cat[i] ? { cat: ed.cat[i] } : {}), ...(ed.tipo[i] ? { tipoUsuario: ed.tipo[i] } : {}) });
  });
  const ls = classificarAvulsas(txs).map(x => ({ id: x.id, data: x.data, desc: x.desc, valor: x.valor, t: x.t, c: x.c }));
  return { ls, brutas };
}

/** Pré-visualização: lista com seleção e mudanças rápidas; resumo do que conta. */
function blocoLinhas(s: Sessao, extra = '') {
  const { ls, brutas } = visao(s);
  const tiradas = s.ed?.excluir.length || 0;
  const sd = saldoMaisRecente(brutas);
  return `<h3>Linhas</h3>
    <p class="sub">${resumoLinhas(ls)}${extra}${sd ? ` Saldo em ${fmtD(sd.data)}: ${brl(sd.valor)}.` : ''}</p>
    ${tiradas ? `<div class="row"><span class="sub">${tiradas === 1 ? '1 linha não vai' : `${tiradas} linhas não vão`} ser importada${tiradas === 1 ? '' : 's'}.</span><button type="button" class="btn small" id="btnDesfazer">Trazer de volta</button></div>` : ''}
    <div id="iLinhas"></div>`;
}

function ligarLinhas(el: HTMLElement, s: Sessao) {
  const box = el.querySelector<HTMLElement>('#iLinhas');
  if (!box) return;
  s.sel ||= new Set();
  const ed = () => (s.ed ||= edicoesVazias());
  const idx = (ids: string[]) => ids.map(Number);
  editorLinhas(box, visao(s).ls, s.sel, {
    rotuloExcluir: 'Não importar',
    categoria: async (ids, c) => { for (const i of idx(ids)) { if (c) ed().cat[i] = c; else delete ed().cat[i]; } passo(); },
    tipo: async (ids, t) => { for (const i of idx(ids)) ed().tipo[i] = t; passo(); },
    inverter: async ids => { const e = ed(); for (const i of idx(ids)) e.inverter = e.inverter.includes(i) ? e.inverter.filter(x => x !== i) : [...e.inverter, i]; passo(); },
    excluir: async ids => { ed().excluir.push(...idx(ids)); s.sel!.clear(); passo(); },
  });
  el.querySelector('#btnDesfazer')?.addEventListener('click', () => { ed().excluir = []; passo(); });
}

/** Linhas que vão ser importadas (para o botão). */
const nImportar = (s: Sessao) => linhasDe(s).length - (s.ed?.excluir.length || 0);

function passoTabela(el: HTMLElement, s: Sessao) {
  const rows = s.rows!, m = s.map!;
  const ncol = Math.max(...rows.slice(0, 40).map(r => r.length));
  const cab = m.linhaCab >= 0 ? rows[m.linhaCab] : [];
  const cols = (nenhuma: boolean) => (nenhuma ? [{ v: '-1', t: '— nenhuma —' }] : []).concat(
    Array.from({ length: ncol }, (_, i) => ({ v: String(i), t: `${nomeCol(i)}${cab[i] !== undefined && cab[i] !== '' ? ': ' + String(cab[i]).slice(0, 30) : ''}` })));
  const conv = aplicarMapeamento(rows, m);
  const modelo = s.modelo ? state.dados.modelos.find(x => x.id === s.modelo) : null;
  el.innerHTML = `<section class="caixa">
    ${cabecalho(s)}
    ${modelo ? `<div class="ok">Usando o modelo salvo “${esc(modelo.nome)}” desta conta.</div>` : '<div class="sub">Confira as colunas. O mapeamento fica salvo como modelo desta conta para a próxima vez.</div>'}
    <form id="fMap" class="form">
      ${s.abas && s.abas.length > 1 ? `<div class="field full"><label for="mAba">Aba da planilha</label><select id="mAba">${opcoes(s.abas.map(a => ({ v: a, t: a })), s.aba)}</select></div>` : ''}
      <div class="field"><label for="mCab">Linha do cabeçalho</label><select id="mCab">${opcoes([{ v: '-1', t: 'Sem cabeçalho' }, ...rows.slice(0, 30).map((r, i) => ({ v: String(i), t: `${i + 1}: ${r.filter(c => c !== '').join(' | ').slice(0, 40)}` }))], String(m.linhaCab))}</select></div>
      <div class="field"><label for="mFmt">Formato da data</label><select id="mFmt">${opcoes([{ v: 'auto', t: 'Automático (dd/mm/aaaa)' }, { v: 'dmy', t: 'dd/mm/aaaa' }, { v: 'ymd', t: 'aaaa-mm-dd' }, { v: 'mdy', t: 'mm/dd/aaaa (americano)' }], m.formatoData)}</select></div>
      <div class="field"><label for="mData">Data</label><select id="mData">${opcoes(cols(false), String(m.colData))}</select></div>
      <div class="field"><label for="mDesc">Descrição</label><select id="mDesc">${opcoes(cols(false), String(m.colDesc))}</select></div>
      <div class="field"><label for="mDesc2">Complemento da descrição</label><select id="mDesc2">${opcoes(cols(true), String(m.colDesc2))}</select></div>
      <div class="field"><label for="mValor">Valor (com sinal)</label><select id="mValor">${opcoes([{ v: '-1', t: '— usar crédito/débito —' }, ...cols(false)], String(m.colValor))}</select></div>
      ${m.colValor < 0 ? `<div class="field"><label for="mCred">Crédito (entradas)</label><select id="mCred">${opcoes(cols(true), String(m.colCredito))}</select></div>
      <div class="field"><label for="mDeb">Débito (saídas)</label><select id="mDeb">${opcoes(cols(true), String(m.colDebito))}</select></div>` : ''}
      <div class="field"><label for="mSaldo">Saldo (opcional)</label><select id="mSaldo">${opcoes(cols(true), String(m.colSaldo))}</select></div>
      <label class="check full"><input type="checkbox" id="mInv"${m.inverter ? ' checked' : ''}> Inverter sinal (no arquivo, gasto aparece positivo — comum em fatura de cartão)</label>
      ${lote.length > 1 ? '' : '<label class="check full"><input type="checkbox" id="mSalvar" checked> Salvar como modelo desta conta</label>'}
    </form>
    ${blocoLinhas(s, conv.ignoradas.length ? ` ${conv.ignoradas.length === 1 ? '1 linha do arquivo foi ignorada' : `${conv.ignoradas.length} linhas do arquivo foram ignoradas`} (sem data ou valor).` : '')}
    ${conv.ignoradas.length ? `<details class="como"><summary>Linhas ignoradas</summary><p>${conv.ignoradas.slice(0, 40).map(i => `linha ${i.linha}: ${i.motivo}`).join('<br>')}</p></details>` : ''}
    <div class="row">${botaoImportar(s, nImportar(s))}${botaoCancelar()}</div>
  </section>`;
  ligarLinhas(el, s);
  const num = (id: string) => Number(($(id) as HTMLSelectElement | null)?.value ?? -1);
  const atualizar = (e: Event) => {
    const novaCab = num('#mCab');
    if (novaCab !== m.linhaCab) { // mudou o cabeçalho: refaz a sugestão a partir dele
      const sug = sugerirMapeamento(rows.slice(novaCab < 0 ? 0 : novaCab));
      Object.assign(m, sug, { linhaCab: novaCab });
    } else {
      Object.assign(m, { colData: num('#mData'), colDesc: num('#mDesc'), colDesc2: num('#mDesc2'), colValor: num('#mValor'),
        colCredito: num('#mCred'), colDebito: num('#mDeb'), colSaldo: num('#mSaldo'), formatoData: ($('#mFmt') as HTMLSelectElement).value, inverter: ($('#mInv') as HTMLInputElement).checked });
    }
    s.modelo = undefined;
    // Colunas mudaram: as linhas podem ser outras, então as mudanças feitas nelas são descartadas.
    if (!(e.target as HTMLElement).matches('#mInv')) { s.ed = undefined; s.sel = undefined; }
    passo();
  };
  el.querySelectorAll('#fMap select:not(#mAba), #mInv').forEach(x => x.addEventListener('change', atualizar));
  $('#mAba')?.addEventListener('change', () => { s.aba = ($('#mAba') as HTMLSelectElement).value; s.rows = s.lerAba!(s.aba); s.ed = undefined; s.sel = undefined; aplicarModelo(s); passo(); });
  ligarCabecalho(el, s);
  $('#btnImp').onclick = async () => {
    if (!(await podeImportar([s]))) return;
    // Num lote, o modelo é sempre salvo (é ele que faz o app reconhecer o arquivo da próxima vez).
    const salvar = ($('#mSalvar') as HTMLInputElement | null)?.checked ?? true;
    s.resultado = [await importar(s.conta, conv.linhas, s.arquivo, s.ed)];
    if (salvar) await salvarModelo(s);
    terminouUm();
  };
}

/** Guarda o mapeamento como modelo da conta (mesmo cabeçalho = mesmo modelo). */
async function salvarModelo(s: Sessao) {
  const m = s.map!, ass = assinatura(s.rows!, m.linhaCab);
  await mudar(d => {
    const existente = d.modelos.find(x => x.conta === s.conta && x.assinatura === ass);
    const md = { ...m, id: existente?.id || uid('m'), conta: s.conta, nome: existente?.nome || `${nomeConta(s.conta)}, ${s.arquivo}`.slice(0, 60), assinatura: ass };
    return { ...d, modelos: [...d.modelos.filter(x => x.id !== md.id), md] };
  });
}

function passoOfx(el: HTMLElement, s: Sessao) {
  const o = s.ofx!;
  const linhas = linhasDe(s);
  el.innerHTML = `<section class="caixa">
    ${cabecalho(s)}
    <p class="sub">OFX ${o.cartao ? 'de cartão' : 'de conta'}${o.banco ? `, banco ${esc(o.banco)}` : ''}${o.contaId ? `, conta ${esc(o.contaId)}` : ''}.</p>
    <label class="check"><input type="checkbox" id="oInv"${s.inverter ? ' checked' : ''}> Inverter sinal</label>
    ${blocoLinhas(s)}
    <div class="row">${botaoImportar(s, nImportar(s))}${botaoCancelar()}</div>
  </section>`;
  $('#oInv').onchange = () => { s.inverter = ($('#oInv') as HTMLInputElement).checked; passo(); };
  ligarCabecalho(el, s);
  ligarLinhas(el, s);
  $('#btnImp').onclick = async () => { if (!(await podeImportar([s]))) return; s.resultado = [await importar(s.conta, linhas, s.arquivo, s.ed)]; terminouUm(); };
}

function passoPdf(el: HTMLElement, s: Sessao) {
  const p = s.pdf!;
  el.innerHTML = `<section class="caixa">
    ${cabecalho(s)}
    <p class="sub">Extrato em PDF${p.banco ? ` do ${esc(p.banco)}` : ''}. Cada movimento tem número de operação, então importar de novo não duplica.</p>
    ${blocoLinhas(s)}
    <div class="row">${botaoImportar(s, nImportar(s))}${botaoCancelar()}</div>
  </section>`;
  ligarCabecalho(el, s);
  ligarLinhas(el, s);
  $('#btnImp').onclick = async () => { if (!(await podeImportar([s]))) return; s.resultado = [await importar(s.conta, p.linhas, s.arquivo, s.ed)]; terminouUm(); };
}

function passoFinai(el: HTMLElement, s: Sessao) {
  const f = s.finai!;
  const d = state.dados;
  el.innerHTML = `<section class="caixa">
    <div class="row between"><h2>${esc(s.arquivo)}</h2>${lote.length > 1 ? '<button type="button" class="btn small" id="btnLista">Voltar à lista</button>' : ''}</div>
    <div class="sub">Arquivo finai-banco/1 gerado em ${esc(f.geradoEm)}. Escolha em que conta do app entra cada conta do arquivo.</div>
    ${f.avisos.map(a => `<div class="err">${esc(a)}</div>`).join('')}
    <div class="form">${f.contas.map(c => `<div class="field full"><label>${esc(c.banco)}, ${esc(c.nome)} (${(f.porConta.get(c.id) || []).length} transações)</label>
      <select data-dest="${esc(c.id)}">${opcoes([{ v: '', t: `Criar conta nova “${c.nome === c.id ? c.id : c.banco + ' ' + c.nome}”` }, ...d.contas.map(x => ({ v: x.id, t: x.nome }))], s.destino![c.id])}</select></div>`).join('')}</div>
    <div class="row"><button type="button" class="btn primary" id="btnImp">Importar</button>${botaoCancelar()}</div>
  </section>`;
  el.querySelectorAll<HTMLSelectElement>('[data-dest]').forEach(x => (x.onchange = () => { s.destino![x.dataset.dest!] = x.value; }));
  $('#btnLista')?.addEventListener('click', () => { aberto = -1; passo(); });
  $('#btnCancelar').onclick = fechar;
  $('#btnImp').onclick = async () => { if (!(await podeImportar([s]))) return; s.resultado = await importarFinai(s); terminouUm(); };
}

async function importarFinai(s: Sessao): Promise<Importacao[]> {
  const f = s.finai!;
  const res: Importacao[] = [];
  for (const c of f.contas) {
    const l = f.porConta.get(c.id) || [];
    if (!l.length) continue;
    let destino = s.destino![c.id];
    if (!destino) {
      const nova: Conta = { ...c, id: state.dados.contas.some(x => x.id === c.id) ? uid(c.id + '-') : c.id, nome: c.nome === c.id ? c.id : `${c.banco} ${c.nome}` };
      await mudar(dd => ({ ...dd, contas: [...dd.contas, nova] }));
      destino = nova.id;
    }
    res.push(await importarLinhasConta(destino, linhasFinai(destino, l), s.arquivo));
  }
  return res;
}

async function importarLinhasConta(conta: string, linhas: LinhaExtrato[], arquivo: string, tiradas: string[] = []): Promise<Importacao> {
  let imp!: Importacao;
  await mudar(d => {
    const excluidas = tiradas.length ? [...new Set([...d.excluidas, ...tiradas])] : d.excluidas;
    const r = importarLinhas({ ...d, excluidas }, linhas, arquivo);
    imp = { ...r.importacao, conta };
    return { ...d, txs: r.txs, revisoes: r.revisoes, excluidas, importacoes: [...d.importacoes, imp].slice(-200) };
  });
  return imp;
}

/**
 * Importa as linhas (com as mudanças da pré-visualização) e, se o arquivo traz saldo, atualiza o
 * saldo da conta (quando é mais novo que o guardado).
 */
async function importar(conta: string, l: LinhaBruta[], arquivo: string, ed?: Edicoes) {
  const r = aplicarEdicoes(chavesDasLinhas(conta, l), ed);
  const imp = await importarLinhasConta(conta, r.linhas, arquivo, r.excluidas);
  const sd = saldoMaisRecente(l);
  if (sd) await mudar(d => ({ ...d, contas: d.contas.map(c => (c.id === conta && (!c.saldoRef || c.saldoRef.data <= sd.data) ? { ...c, saldoRef: sd } : c)) }));
  return imp;
}

const somar = (rs: Importacao[]) => rs.reduce((a, i) => ({ novas: a.novas + i.novas, unidas: a.unidas + i.unidas, revisao: a.revisao + i.revisao, repetidas: a.repetidas + i.repetidas }), { novas: 0, unidas: 0, revisao: 0, repetidas: 0 });

function resumoImp(rs: Importacao[]) {
  const t = somar(rs);
  const n = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
  return [n(t.novas, 'nova', 'novas'), n(t.unidas, 'unida', 'unidas'), t.revisao ? `${t.revisao} em revisão` : '', t.repetidas ? n(t.repetidas, 'repetida', 'repetidas') : ''].filter(Boolean).join(', ');
}

function painelResultado(ss: Sessao[]) {
  const rs = ss.flatMap(s => s.resultado || []);
  const t = somar(rs);
  return `<section class="caixa">
    <h2>Importado</h2>
    <div class="stats">
      <div><span class="label">Novas</span><b class="lg">${t.novas}</b></div>
      <div><span class="label">Unidas</span><b class="lg">${t.unidas}</b></div>
      <div><span class="label">Revisão</span><b class="lg ${t.revisao ? 'warn' : ''}">${t.revisao}</b></div>
    </div>
    ${ss.length > 1 ? `<div class="list">${ss.map(s => `<div class="item"><div class="name">${esc(s.arquivo)}</div><div class="val sub">${esc((s.resultado || []).map(r => nomeConta(r.conta)).join(', '))}</div>
      <div class="meta">${resumoImp(s.resultado || [])}</div></div>`).join('')}</div>` : ''}
    ${pulados.length ? `<div class="sub">Ficaram de fora por já terem sido importados: ${esc(pulados.join(', '))}.</div>` : ''}
    <div class="sub">${t.repetidas ? `${t.repetidas} linhas já tinham sido importadas antes e foram puladas. ` : ''}“Unidas” são linhas que já existiam por notificação ou lançamento manual: o extrato prevaleceu e a origem ficou registrada.</div>
    <div class="row">${t.revisao ? '<button type="button" class="btn primary" data-ir="revisao">Revisar agora</button>' : ''}
      <button type="button" class="btn" data-ir="conferencia?conta=${encodeURIComponent(rs[0]?.conta || '')}&mes=${(rs[0]?.ate || hoje()).slice(0, 7)}">Conferência</button>
      <button type="button" class="btn" id="btnNovoArq">Importar outros</button></div>
  </section>`;
}

// ---------- Um arquivo já importado ----------

let selImp: { id: string; sel: Set<string> } = { id: '', sel: new Set() };

export function telaImportacao(el: HTMLElement, id: string) {
  const d = state.dados;
  const imp = d.importacoes.find(i => i.id === id);
  if (!imp) { el.innerHTML = '<div class="panel"><div class="empty">Importação não encontrada.</div></div>'; return; }
  if (selImp.id !== id) selImp = { id, sel: new Set() };
  const ids = new Set(txsDaImportacao(d.txs, imp).map(t => t.id));
  const minhas = classificadas().filter(x => ids.has(x.id)).sort((a, b) => b.data.localeCompare(a.data));
  const revs = d.revisoes.filter(r => r.em === imp.em && r.arquivo === imp.arquivo);
  const cartao = d.contas.find(c => c.id === imp.conta)?.tipo === 'cartao';
  const trocado = cartao && sinalTrocado(minhas);
  const vis: LinhaVis[] = minhas.map(x => ({ id: x.id, data: x.data, desc: x.desc, valor: x.valor, t: x.t, c: x.c,
    ...(x.origens.some(o => o.tipo !== 'extrato') ? { nota: 'unida a notificação ou lançamento' } : {}) }));
  el.innerHTML = `<section class="caixa">
      <h2>${esc(imp.arquivo)}</h2>
      <p class="sub">${esc(nomeConta(imp.conta))}, de ${fmtD(imp.de)} a ${fmtD(imp.ate)}. Importado em ${fmtQuando(Date.parse(imp.em))}: ${resumoImp([imp])}.</p>
      ${trocado ? `<div class="aviso-bloco"><p>As compras deste cartão estão positivas, como entrada: o sinal do arquivo parece trocado.</p>
        <button type="button" class="btn small primary" id="btnInvTudo">Inverter o sinal de todas</button></div>` : ''}
      ${revs.length ? `<button type="button" class="aviso" data-ir="revisao">${revs.length === 1 ? '1 linha deste arquivo espera' : `${revs.length} linhas deste arquivo esperam`} revisão</button>` : ''}
      <div class="row"><button type="button" class="btn small danger" id="btnRemImp">Remover esta importação</button></div>
    </section>
    <section class="panel">
      <p class="sub">${minhas.length ? resumoLinhas(vis) : 'Nenhuma transação deste arquivo continua no app (todas repetidas, em revisão ou excluídas).'}</p>
      <div id="impLinhas"></div>
    </section>`;
  if (minhas.length) editorLinhas(el.querySelector<HTMLElement>('#impLinhas')!, vis, selImp.sel, {
    categoria: async (sel, c) => { await editarTxs(sel, t => { const n = { ...t }; if (c) n.cat = c; else delete n.cat; return n; }); toast('Categoria mudada.'); },
    tipo: async (sel, tp) => { await editarTxs(sel, t => ({ ...t, tipoUsuario: tp })); toast('Tipo mudado.'); },
    inverter: async sel => { await editarTxs(sel, t => ({ ...t, valor: -t.valor })); toast('Sinal invertido.'); },
    excluir: async sel => { await excluirTxs(sel); toast(sel.length === 1 ? 'Excluída. Reimportar o arquivo não a traz de volta.' : 'Excluídas. Reimportar o arquivo não as traz de volta.'); },
  });
  el.querySelector('#btnRemImp')?.addEventListener('click', async () => { if (await removerImportacoes([id])) voltar(); });
  el.querySelector('#btnInvTudo')?.addEventListener('click', async () => {
    await editarTxs([...ids], t => ({ ...t, valor: -t.valor }));
    toast('Sinal invertido em todas.');
  });
}

// ---------- Revisão ----------

export function telaRevisao(el: HTMLElement) {
  const d = state.dados;
  el.innerHTML = `<p class="sub">Linhas de extrato que podem ser uma transação que já estava aqui (mesma conta e valor, data próxima), mas com dúvida. Escolha qual é, ou diga que é outra.</p>
  ${d.revisoes.map(r => {
    const cands = r.candidatos.map(id => d.txs.find(t => t.id === id)).filter(t => t && !t.origens.some(o => o.tipo === 'extrato'));
    return `<section class="caixa">
      <p class="label">${esc(nomeConta(r.linha.conta))}, ${esc(r.arquivo)}</p>
      <div class="mini-tx"><b>${sinal(r.linha.valor)}</b> em ${fmtD(r.linha.data)}, ${esc(r.linha.desc)} <span class="sub">No extrato</span></div>
      <div class="sub">É a mesma que…</div>
      <div class="list">${cands.map(t => `<div class="cand">${linhaTx(t!)}<button type="button" class="btn small primary" data-rev="${esc(r.id)}" data-tx="${esc(t!.id)}">É esta</button></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-rev="${esc(r.id)}" data-tx="">É outra (criar nova)</button></div>
    </section>`;
  }).join('') || '<div class="empty">Nada para revisar.</div>'}`;
  el.querySelectorAll<HTMLButtonElement>('[data-rev]').forEach(b => (b.onclick = async () => {
    await mudar(dd => ({ ...dd, ...resolverRevisao(dd, b.dataset.rev!, b.dataset.tx || null) }));
    toast(b.dataset.tx ? 'Unidas.' : 'Criada como nova.');
    dispatchEvent(new Event('rerender'));
  }));
}

// ---------- Conferência ----------

export function telaConferencia(el: HTMLElement, r: Rota) {
  const d = state.dados;
  const conta = r.query.get('conta') || d.contas.find(c => c.ativa)?.id || '';
  const mes = r.query.get('mes') || hoje().slice(0, 7);
  const c = conferencia(d.txs, d.revisoes, d.importacoes, conta, mes);
  const lista = (ts: typeof c.bateu, vazio: string) => `<div class="list">${ts.map(t => `<button type="button" class="item" data-ir="tx/${esc(t.id)}">${linhaTx(t)}</button>`).join('') || `<div class="empty">${vazio}</div>`}</div>`;
  const soma = (ts: typeof c.bateu) => sinal(ts.reduce((a, t) => a + t.valor, 0));
  el.innerHTML = `<section class="caixa">
    <div class="form">
      <div class="field"><label for="cConta">Conta</label><select id="cConta">${opcoes(d.contas.map(x => ({ v: x.id, t: x.nome })), conta)}</select></div>
      <div class="field"><label for="cMes">Mês</label><select id="cMes">${opcoes(Array.from({ length: 24 }, (_, i) => somaMes(hoje().slice(0, 7), -i)).map(m => ({ v: m, t: mesLongo(m) })), mes)}</select></div>
    </div>
    <div class="sub">${c.periodo ? `Extratos importados cobrem de ${fmtD(c.periodo.de)} a ${fmtD(c.periodo.ate)}.` : 'Nenhum extrato importado cobre este mês: tudo aparece como “só notificação/manual”.'}</div>
    ${c.revisao.length ? `<button type="button" class="aviso" data-ir="revisao">${c.revisao.length === 1 ? '1 linha espera' : `${c.revisao.length} linhas esperam`} revisão nesta conta e mês</button>` : ''}
  </section>
  <section class="caixa"><div class="row between"><h2>Bateu (${c.bateu.length})</h2><span class="sub">${soma(c.bateu)}</span></div>
    <div class="note">Veio por notificação ou à mão e também está no extrato.</div>${lista(c.bateu, 'Nada.')}</section>
  <section class="caixa"><div class="row between"><h2>Só no extrato (${c.soExtrato.length})</h2><span class="sub">${soma(c.soExtrato)}</span></div>
    <div class="note">Não chegou notificação (ou a regra não pegou). Vale olhar se falta regra.</div>${lista(c.soExtrato, 'Nada.')}</section>
  <section class="caixa"><div class="row between"><h2>Só por notificação/manual (${c.soNotificacao.length})</h2><span class="sub">${soma(c.soNotificacao)}</span></div>
    <div class="note">Não apareceu no extrato. ${c.periodo ? 'Dentro do período do extrato, pode ser duplicada ou lançada na conta errada.' : ''}</div>${lista(c.soNotificacao, 'Nada.')}</section>`;
  const ir2 = () => trocar(`conferencia?conta=${encodeURIComponent(($('#cConta') as HTMLSelectElement).value)}&mes=${($('#cMes') as HTMLSelectElement).value}`);
  $('#cConta').onchange = ir2;
  $('#cMes').onchange = ir2;
}
