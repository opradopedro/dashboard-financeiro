// Lista de linhas com seleção (uma a uma, todas ou nenhuma) e mudanças rápidas nas marcadas:
// categoria, tipo, inverter sinal e excluir. Usada na pré-visualização da importação e na tela
// de um arquivo já importado.
import { TIPOS, type TipoTx } from '../core/tipos';
import { escolherCategoria, escolherOpcao } from './escolher';
import { brl, esc, fmtD, sinal } from './fmt';

export interface LinhaVis {
  id: string;
  data: string;
  desc: string;
  valor: number;
  t: TipoTx;      // tipo final (previsto, na importação)
  c: string;      // categoria final ('' = sem)
  nota?: string;  // ex.: "unida a uma notificação"
}

export interface AcoesLinhas {
  categoria(ids: string[], cat: string): Promise<void>;
  tipo(ids: string[], t: TipoTx): Promise<void>;
  inverter(ids: string[]): Promise<void>;
  excluir(ids: string[]): Promise<void>;
  /** Texto do botão de excluir (ex.: "Não importar"). */
  rotuloExcluir?: string;
}

const NOTA_TIPO: Partial<Record<TipoTx, string>> = {
  fatura: 'pagamento da fatura do cartão: não conta como entrada nem gasto',
  interna: 'entre contas suas: não conta',
  caixinha: 'guardar ou resgatar: não conta',
};

/** Resumo do que conta (entradas e gastos) e do que fica de fora. */
export function resumoLinhas(ls: LinhaVis[]) {
  let e = 0, s = 0;
  const fora: Partial<Record<TipoTx, number>> = {};
  for (const l of ls) {
    if (l.t === 'entrada') e += l.valor;
    else if (l.t === 'saida') s -= l.valor;
    else fora[l.t] = (fora[l.t] || 0) + Math.abs(l.valor);
  }
  const f = (Object.keys(fora) as TipoTx[]).map(t => `${TIPOS[t].toLowerCase()} ${brl(fora[t]!)}`);
  return `${ls.length === 1 ? '1 linha' : `${ls.length} linhas`}: entradas ${brl(e)}, gastos ${brl(s)}${f.length ? `. Fora da conta: ${f.join(', ')}` : ''}.`;
}

/**
 * Desenha a lista em `el`. A seleção fica em `sel` (de quem chama), para sobreviver ao redesenho
 * depois de cada mudança.
 */
export function editorLinhas(el: HTMLElement, ls: LinhaVis[], sel: Set<string>, acoes: AcoesLinhas) {
  for (const id of [...sel]) if (!ls.some(l => l.id === id)) sel.delete(id);
  const n = sel.size, todas = n > 0 && n === ls.length;
  el.innerHTML = `<div class="sel-barra">
      <div class="row between nowrap">
        <label class="check"><input type="checkbox" id="lsTodas"${todas ? ' checked' : ''}> ${todas ? 'Desmarcar todas' : 'Marcar todas'}</label>
        <span class="sub">${n ? `${n} de ${ls.length} marcadas` : 'Toque nas linhas para marcar'}</span>
      </div>
      <div class="sel-acoes">
        <button type="button" class="btn small" data-acao="categoria"${n ? '' : ' disabled'}>Categoria</button>
        <button type="button" class="btn small" data-acao="tipo"${n ? '' : ' disabled'}>Tipo</button>
        <button type="button" class="btn small" data-acao="inverter"${n ? '' : ' disabled'}>Inverter sinal</button>
        <button type="button" class="btn small danger" data-acao="excluir"${n ? '' : ' disabled'}>${esc(acoes.rotuloExcluir || 'Excluir')}</button>
      </div>
    </div>
    <div class="linhas-ed">${ls.map(l => {
      const conta = l.t === 'entrada' || l.t === 'saida';
      return `<label class="linha-ed${sel.has(l.id) ? ' marcada' : ''}${conta ? '' : ' fora'}">
        <input type="checkbox" data-sel="${esc(l.id)}"${sel.has(l.id) ? ' checked' : ''}>
        <span class="le-txt"><span class="le-desc">${esc(l.desc)}</span>
          <span class="le-meta">${fmtD(l.data)}, ${conta ? esc(l.c || 'Sem categoria') : `<b class="le-tipo">${esc(TIPOS[l.t])}</b>`}${l.nota ? `, ${esc(l.nota)}` : ''}</span></span>
        <b class="le-val${l.valor > 0 ? ' pos' : ''}">${sinal(l.valor)}</b>
      </label>`;
    }).join('') || '<div class="empty">Nenhuma linha.</div>'}</div>`;

  const redesenhar = () => editorLinhas(el, ls, sel, acoes);
  (el.querySelector('#lsTodas') as HTMLInputElement).onchange = () => {
    if (todas) sel.clear(); else ls.forEach(l => sel.add(l.id));
    redesenhar();
  };
  el.querySelectorAll<HTMLInputElement>('[data-sel]').forEach(c => (c.onchange = () => {
    if (c.checked) sel.add(c.dataset.sel!); else sel.delete(c.dataset.sel!);
    redesenhar();
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-acao]').forEach(b => (b.onclick = async () => {
    const ids = [...sel];
    if (!ids.length) return;
    const a = b.dataset.acao;
    if (a === 'categoria') {
      const c = await escolherCategoria('', { receita: () => ls.filter(l => sel.has(l.id)).every(l => l.valor > 0) });
      if (c !== null) await acoes.categoria(ids, c);
    } else if (a === 'tipo') {
      const t = await escolherOpcao(`Tipo de ${ids.length === 1 ? '1 linha' : `${ids.length} linhas`}`,
        (Object.keys(TIPOS) as TipoTx[]).map(v => ({ v, t: TIPOS[v], nota: NOTA_TIPO[v] })));
      if (t) await acoes.tipo(ids, t as TipoTx);
    } else if (a === 'inverter') await acoes.inverter(ids);
    else if (a === 'excluir') {
      if (!confirm(`${acoes.rotuloExcluir || 'Excluir'}: ${ids.length === 1 ? '1 linha' : `${ids.length} linhas`}?`)) return;
      await acoes.excluir(ids);
      sel.clear();
    }
  }));
}
