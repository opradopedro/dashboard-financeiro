// Importação de extratos (CSV, Excel, OFX e finai-banco/1), revisão de casos duvidosos e
// conferência mensal por conta.
import { mudar, nomeConta, state } from '../app';
import { chavesDasLinhas, conferencia, importarLinhas, resolverRevisao, saldoMaisRecente, type LinhaBruta } from '../core/juntar';
import { itensPdf, lerExtratoPdf, type ExtratoPdf } from '../importar/pdf';
import { lerFinai, linhasFinai, type LidoFinai } from '../core/finai';
import type { Conta, Importacao, Mapeamento } from '../core/tipos';
import { hoje, somaMes, uid } from '../core/util';
import { lerCsv } from '../importar/csv';
import { aplicarMapeamento, assinatura, modeloPara, sugerirMapeamento } from '../importar/mapear';
import { lerOfx, type Ofx } from '../importar/ofx';
import { lerPlanilha, type Celula } from '../importar/planilha';
import { decodificar } from '../importar/texto';
import { $, brl, esc, fmtD, fmtQuando, mesLongo, opcoes, sinal, toast } from './fmt';
import { linhaTx } from './transacoes';
import { trocar, type Rota } from './nav';

interface Sessao {
  arquivo: string;
  tipo: 'tabela' | 'ofx' | 'finai' | 'pdf';
  pdf?: ExtratoPdf;
  conta: string;
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
}
let sessao: Sessao | null = null;

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nomeCol = (i: number) => (i < 26 ? COLS[i] : 'A' + COLS[i - 26]);

export function telaImportar(el: HTMLElement) {
  const d = state.dados;
  const contas = d.contas.filter(c => c.ativa);
  const conta = sessao?.conta || contas[0]?.id || '';
  el.innerHTML = `<section class="panel">
    <p class="sub">Extrato da conta ou fatura do cartão, em PDF do Mercado Pago, CSV, Excel, OFX ou finai-banco/1. Importar de novo o mesmo arquivo não duplica, e o que já tinha vindo por notificação ou à mão é unido à linha do extrato.</p>
    <div class="form">
      <div class="field full"><label for="iConta">Conta do arquivo</label><select id="iConta">${opcoes(contas.map(c => ({ v: c.id, t: c.nome })), conta)}</select></div>
    </div>
    <div class="row"><label class="btn primary" for="iArq">Escolher arquivo<input type="file" id="iArq" accept=".pdf,.csv,.txt,.xlsx,.xls,.ofx,.qfx,.json,application/pdf,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/x-ofx,*/*"></label>
      <button type="button" class="btn" data-ir="revisao">Revisão${d.revisoes.length ? ` (${d.revisoes.length})` : ''}</button>
      <button type="button" class="btn" data-ir="conferencia">Conferir mês</button></div>
  </section>
  <div id="iPasso"></div>
  <section class="panel"><h2>Já importados</h2><div class="folha"><div class="list">${[...d.importacoes].reverse().slice(0, 30).map(i => `<div class="item">
    <div class="name">${esc(i.arquivo)}</div><div class="val sub">${fmtQuando(Date.parse(i.em))}</div>
    <div class="meta">${esc(nomeConta(i.conta))}, de ${fmtD(i.de)} a ${fmtD(i.ate)}</div>
    <div class="meta r">${i.novas} novas, ${i.unidas} unidas${i.revisao ? `, ${i.revisao} em revisão` : ''}${i.repetidas ? `, ${i.repetidas} repetidas` : ''}</div></div>`).join('') || '<div class="empty">Nenhum arquivo importado ainda.</div>'}</div></div></section>`;

  $('#iConta').onchange = () => { if (sessao) { sessao.conta = ($('#iConta') as HTMLSelectElement).value; sessao.modelo = undefined; aplicarModelo(); passo(); } };
  ($('#iArq') as HTMLInputElement).onchange = async e => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    sessao = { arquivo: f.name, tipo: 'tabela', conta: ($('#iConta') as HTMLSelectElement).value };
    try { await abrirArquivo(f); } catch (err) { sessao.erro = (err as Error).message; }
    passo();
  };
  passo();
}

async function abrirArquivo(f: File) {
  const s = sessao!;
  const buf = await f.arrayBuffer();
  const nome = f.name.toLowerCase();
  if (/\.pdf$/.test(nome) || new TextDecoder().decode(new Uint8Array(buf.slice(0, 5))) === '%PDF-') {
    s.tipo = 'pdf';
    s.pdf = lerExtratoPdf(await itensPdf(buf));
    // Extrato do Mercado Pago: sugere a conta do Mercado Pago (não o cartão).
    const sug = s.pdf.banco && state.dados.contas.find(c => c.ativa && c.tipo === 'corrente' && c.banco.toLowerCase() === s.pdf!.banco.toLowerCase());
    if (sug) s.conta = sug.id;
    return;
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
      return;
    }
    if (/\.json$/.test(nome) || /^\s*\{/.test(texto)) {
      s.tipo = 'finai'; s.finai = lerFinai(texto);
      s.destino = Object.fromEntries(s.finai.contas.map(c => [c.id, state.dados.contas.some(x => x.id === c.id) ? c.id : '']));
      return;
    }
    s.rows = lerCsv(texto);
  }
  if (!s.rows?.length) throw new Error('O arquivo está vazio.');
  aplicarModelo();
}

/** Usa o modelo salvo da conta (mesmo cabeçalho) ou sugere o mapeamento. */
function aplicarModelo() {
  const s = sessao;
  if (!s || s.tipo !== 'tabela' || !s.rows) return;
  const md = modeloPara(state.dados.modelos, s.conta, s.rows);
  if (md) { s.map = { ...md }; s.modelo = md.id; return; }
  s.map = sugerirMapeamento(s.rows);
  // Fatura de cartão costuma trazer as compras positivas: se a maioria for positiva, inverte.
  const conta = state.dados.contas.find(c => c.id === s.conta);
  if (conta?.tipo === 'cartao') {
    const l = aplicarMapeamento(s.rows, s.map).linhas;
    if (l.length && l.filter(x => x.valor > 0).length / l.length > 0.6) s.map.inverter = true;
  }
}

function passo() {
  const el = document.getElementById('iPasso');
  if (!el) return;
  const s = sessao;
  if (!s) { el.innerHTML = ''; return; }
  if (s.erro) { el.innerHTML = `<section class="caixa"><div class="err">${esc(s.arquivo)}: ${esc(s.erro)}</div></section>`; return; }
  if (s.resultado) {
    el.innerHTML = painelResultado(s.resultado);
    $('#btnNovoArq').onclick = () => { sessao = null; passo(); };
    return;
  }
  if (s.tipo === 'tabela') passoTabela(el, s);
  else if (s.tipo === 'ofx') passoOfx(el, s);
  else if (s.tipo === 'pdf') passoPdf(el, s);
  else passoFinai(el, s);
}

function previa(linhas: LinhaBruta[], extra = '') {
  return `<div class="tabela"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>
    ${linhas.slice(0, 12).map(l => `<tr><td>${fmtD(l.data)}</td><td class="desc">${esc(l.desc)}</td><td class="${l.valor > 0 ? 'up' : ''}">${sinal(l.valor)}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="sub">${linhas.length === 1 ? '1 linha' : `${linhas.length} linhas`}${linhas.length > 12 ? ' (mostrando 12)' : ''}: entradas ${brl(linhas.filter(l => l.valor > 0).reduce((a, l) => a + l.valor, 0))}, saídas ${brl(-linhas.filter(l => l.valor < 0).reduce((a, l) => a + l.valor, 0))}${extra}.${(() => { const sd = saldoMaisRecente(linhas); return sd ? ` Saldo em ${fmtD(sd.data)}: ${brl(sd.valor)}.` : ''; })()}</p>`;
}

function passoTabela(el: HTMLElement, s: Sessao) {
  const rows = s.rows!, m = s.map!;
  const ncol = Math.max(...rows.slice(0, 40).map(r => r.length));
  const cab = m.linhaCab >= 0 ? rows[m.linhaCab] : [];
  const cols = (nenhuma: boolean) => (nenhuma ? [{ v: '-1', t: '— nenhuma —' }] : []).concat(
    Array.from({ length: ncol }, (_, i) => ({ v: String(i), t: `${nomeCol(i)}${cab[i] !== undefined && cab[i] !== '' ? ': ' + String(cab[i]).slice(0, 30) : ''}` })));
  const conv = aplicarMapeamento(rows, m);
  const modelo = s.modelo ? state.dados.modelos.find(x => x.id === s.modelo) : null;
  el.innerHTML = `<section class="caixa">
    <h2>${esc(s.arquivo)}</h2>
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
      <label class="check full"><input type="checkbox" id="mSalvar" checked> Salvar como modelo desta conta</label>
    </form>
    <h3>Pré-visualização</h3>
    ${previa(conv.linhas, conv.ignoradas.length ? `; ${conv.ignoradas.length} ignoradas` : '')}
    ${conv.ignoradas.length ? `<details class="como"><summary>Linhas ignoradas</summary><p>${conv.ignoradas.slice(0, 40).map(i => `linha ${i.linha}: ${i.motivo}`).join('<br>')}</p></details>` : ''}
    <div class="row"><button type="button" class="btn primary" id="btnImp"${conv.linhas.length ? '' : ' disabled'}>Importar ${conv.linhas.length} linhas em ${esc(nomeConta(s.conta))}</button>
      <button type="button" class="btn" id="btnCancelar">Cancelar</button></div>
  </section>`;
  const num = (id: string) => Number(($(id) as HTMLSelectElement | null)?.value ?? -1);
  const atualizar = () => {
    const novaCab = num('#mCab');
    if (novaCab !== m.linhaCab) { // mudou o cabeçalho: refaz a sugestão a partir dele
      const sug = sugerirMapeamento(rows.slice(novaCab < 0 ? 0 : novaCab));
      Object.assign(m, sug, { linhaCab: novaCab });
    } else {
      Object.assign(m, { colData: num('#mData'), colDesc: num('#mDesc'), colDesc2: num('#mDesc2'), colValor: num('#mValor'),
        colCredito: num('#mCred'), colDebito: num('#mDeb'), colSaldo: num('#mSaldo'), formatoData: ($('#mFmt') as HTMLSelectElement).value, inverter: ($('#mInv') as HTMLInputElement).checked });
    }
    s.modelo = undefined;
    passo();
  };
  el.querySelectorAll('#fMap select:not(#mAba), #mInv').forEach(x => x.addEventListener('change', atualizar));
  $('#mAba')?.addEventListener('change', () => { s.aba = ($('#mAba') as HTMLSelectElement).value; s.rows = s.lerAba!(s.aba); s.modelo = undefined; aplicarModelo(); passo(); });
  $('#btnCancelar').onclick = () => { sessao = null; passo(); };
  $('#btnImp').onclick = async () => {
    const salvarModelo = ($('#mSalvar') as HTMLInputElement).checked;
    const imp = await importar(s.conta, conv.linhas, s.arquivo);
    if (salvarModelo) {
      const ass = assinatura(rows, m.linhaCab);
      await mudar(d => {
        const existente = d.modelos.find(x => x.conta === s.conta && x.assinatura === ass);
        const md = { ...m, id: existente?.id || uid('m'), conta: s.conta, nome: existente?.nome || `${nomeConta(s.conta)}, ${s.arquivo}`.slice(0, 60), assinatura: ass };
        return { ...d, modelos: [...d.modelos.filter(x => x.id !== md.id), md] };
      });
    }
    s.resultado = [imp];
    passo();
  };
}

function passoOfx(el: HTMLElement, s: Sessao) {
  const o = s.ofx!;
  const linhas = o.linhas.map(l => ({ ...l, valor: s.inverter ? -l.valor : l.valor }));
  el.innerHTML = `<section class="caixa">
    <h2>${esc(s.arquivo)}</h2>
    <p class="sub">OFX ${o.cartao ? 'de cartão' : 'de conta'}${o.banco ? `, banco ${esc(o.banco)}` : ''}${o.contaId ? `, conta ${esc(o.contaId)}` : ''}. Confira se a conta escolhida acima é a certa.</p>
    <label class="check"><input type="checkbox" id="oInv"${s.inverter ? ' checked' : ''}> Inverter sinal</label>
    ${previa(linhas)}
    <div class="row"><button type="button" class="btn primary" id="btnImp">Importar ${linhas.length} linhas em ${esc(nomeConta(s.conta))}</button>
      <button type="button" class="btn" id="btnCancelar">Cancelar</button></div>
  </section>`;
  $('#oInv').onchange = () => { s.inverter = ($('#oInv') as HTMLInputElement).checked; passo(); };
  $('#btnCancelar').onclick = () => { sessao = null; passo(); };
  $('#btnImp').onclick = async () => { s.resultado = [await importar(s.conta, linhas, s.arquivo)]; passo(); };
}

function passoPdf(el: HTMLElement, s: Sessao) {
  const p = s.pdf!;
  ($('#iConta') as HTMLSelectElement).value = s.conta;
  el.innerHTML = `<section class="caixa">
    <h2>${esc(s.arquivo)}</h2>
    <p class="sub">Extrato em PDF${p.banco ? ` do ${esc(p.banco)}` : ''}. Cada movimento tem número de operação, então importar de novo não duplica. Confira a conta escolhida acima.</p>
    ${previa(p.linhas)}
    <div class="row"><button type="button" class="btn primary" id="btnImp">Importar ${p.linhas.length} linhas em ${esc(nomeConta(s.conta))}</button>
      <button type="button" class="btn" id="btnCancelar">Cancelar</button></div>
  </section>`;
  $('#btnCancelar').onclick = () => { sessao = null; passo(); };
  $('#btnImp').onclick = async () => { s.resultado = [await importar(s.conta, p.linhas, s.arquivo)]; passo(); };
}

function passoFinai(el: HTMLElement, s: Sessao) {
  const f = s.finai!;
  const d = state.dados;
  el.innerHTML = `<section class="caixa">
    <h2>${esc(s.arquivo)}</h2>
    <div class="sub">Arquivo finai-banco/1 gerado em ${esc(f.geradoEm)}. Escolha em que conta do app entra cada conta do arquivo (a conta escolhida lá em cima não vale aqui).</div>
    ${f.avisos.map(a => `<div class="err">${esc(a)}</div>`).join('')}
    <div class="form">${f.contas.map(c => `<div class="field full"><label>${esc(c.banco)}, ${esc(c.nome)} (${(f.porConta.get(c.id) || []).length} transações)</label>
      <select data-dest="${esc(c.id)}">${opcoes([{ v: '', t: `Criar conta nova “${c.nome === c.id ? c.id : c.banco + ' ' + c.nome}”` }, ...d.contas.map(x => ({ v: x.id, t: x.nome }))], s.destino![c.id])}</select></div>`).join('')}</div>
    <div class="row"><button type="button" class="btn primary" id="btnImp">Importar</button><button type="button" class="btn" id="btnCancelar">Cancelar</button></div>
  </section>`;
  el.querySelectorAll<HTMLSelectElement>('[data-dest]').forEach(x => (x.onchange = () => { s.destino![x.dataset.dest!] = x.value; }));
  $('#btnCancelar').onclick = () => { sessao = null; passo(); };
  $('#btnImp').onclick = async () => {
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
    s.resultado = res;
    passo();
  };
}

async function importarLinhasConta(conta: string, linhas: ReturnType<typeof chavesDasLinhas>, arquivo: string): Promise<Importacao> {
  let imp!: Importacao;
  await mudar(d => {
    const r = importarLinhas(d, linhas, arquivo);
    imp = { ...r.importacao, conta };
    return { ...d, txs: r.txs, revisoes: r.revisoes, importacoes: [...d.importacoes, imp].slice(-200) };
  });
  return imp;
}

/** Importa as linhas e, se o arquivo traz saldo, atualiza o saldo da conta (quando é mais novo que o guardado). */
async function importar(conta: string, l: LinhaBruta[], arquivo: string) {
  const imp = await importarLinhasConta(conta, chavesDasLinhas(conta, l), arquivo);
  const sd = saldoMaisRecente(l);
  if (sd) await mudar(d => ({ ...d, contas: d.contas.map(c => (c.id === conta && (!c.saldoRef || c.saldoRef.data <= sd.data) ? { ...c, saldoRef: sd } : c)) }));
  return imp;
}

function painelResultado(rs: Importacao[]) {
  const t = rs.reduce((a, i) => ({ novas: a.novas + i.novas, unidas: a.unidas + i.unidas, revisao: a.revisao + i.revisao, repetidas: a.repetidas + i.repetidas }), { novas: 0, unidas: 0, revisao: 0, repetidas: 0 });
  return `<section class="caixa">
    <h2>Importado</h2>
    <div class="stats">
      <div><span class="label">Novas</span><b class="lg">${t.novas}</b></div>
      <div><span class="label">Unidas</span><b class="lg">${t.unidas}</b></div>
      <div><span class="label">Revisão</span><b class="lg ${t.revisao ? 'warn' : ''}">${t.revisao}</b></div>
    </div>
    <div class="sub">${t.repetidas ? `${t.repetidas} linhas já tinham sido importadas antes e foram puladas. ` : ''}“Unidas” são linhas que já existiam por notificação ou lançamento manual: o extrato prevaleceu e a origem ficou registrada.</div>
    <div class="row">${t.revisao ? '<button type="button" class="btn primary" data-ir="revisao">Revisar agora</button>' : ''}
      <button type="button" class="btn" data-ir="conferencia?conta=${encodeURIComponent(rs[0]?.conta || '')}&mes=${(rs[0]?.ate || hoje()).slice(0, 7)}">Conferência</button>
      <button type="button" class="btn" id="btnNovoArq">Importar outro</button></div>
  </section>`;
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
