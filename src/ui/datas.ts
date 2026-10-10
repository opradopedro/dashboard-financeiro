// Campos de data sempre em dd/mm/aaaa. O <input type="date"> mostra a data no formato do idioma do
// Android (no aparelho em inglês, mm/dd/aaaa) e o app não controla isso. Então cada campo de data
// vira: um campo de texto dd/mm/aaaa (com as barras automáticas) + um botão de calendário no visual
// do app. O <input type="date"> original fica escondido, com o mesmo id, guardando AAAA-MM-DD: as
// telas continuam lendo `.value` dele como antes.
import { esc } from './fmt';
import { ICONES } from './icones';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ICONE_CAL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

const p2 = (n: number) => String(n).padStart(2, '0');
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

/** AAAA-MM-DD → dd/mm/aaaa ('' se vazio ou inválido). */
export const isoParaBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** dd/mm/aaaa → AAAA-MM-DD, ou null se não for uma data que existe. */
export function brParaIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const d = +m[1], mes = +m[2], a = +m[3];
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d || a < 1900) return null;
  return `${a}-${p2(mes)}-${p2(d)}`;
}

/** Digitando só números, as barras entram sozinhas: 28082026 → 28/08/2026. */
export function mascara(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 8);
  return n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
}

/** Calendário em folha que sobe de baixo. Devolve AAAA-MM-DD, '' (limpar) ou null (fechou). */
export function escolherData(atual: string, op: { titulo?: string; limpar?: boolean } = {}): Promise<string | null> {
  return new Promise(resolve => {
    let escolhido: string | null = null;
    const base = /^\d{4}-\d{2}/.test(atual) ? atual : hojeIso();
    let ano = +base.slice(0, 4), mes = +base.slice(5, 7) - 1;
    const dlg = document.createElement('dialog');
    dlg.className = 'folha-sel folha-cal';
    dlg.setAttribute('aria-label', op.titulo || 'Escolher data');
    document.body.appendChild(dlg);
    const desenhar = () => {
      const primeiro = new Date(ano, mes, 1).getDay(), dias = new Date(ano, mes + 1, 0).getDate(), hoje = hojeIso();
      const cel: string[] = Array.from({ length: primeiro }, () => '<span></span>');
      for (let d = 1; d <= dias; d++) {
        const iso = `${ano}-${p2(mes + 1)}-${p2(d)}`;
        cel.push(`<button type="button" class="cal-dia${iso === atual ? ' atual' : ''}${iso === hoje ? ' hoje' : ''}" data-d="${iso}" aria-label="${d} de ${MESES[mes]} de ${ano}"${iso === atual ? ' aria-pressed="true"' : ''}>${d}</button>`);
      }
      dlg.innerHTML = `<div class="folha-sel-cab cal-cab">
          <button type="button" class="cal-seta" data-m="-1" aria-label="Mês anterior">${ICONES.antes}</button>
          <h2 class="folha-sel-titulo">${MESES[mes]} <small>${ano}</small></h2>
          <button type="button" class="cal-seta" data-m="1" aria-label="Próximo mês">${ICONES.depois}</button>
        </div>
        <div class="cal">
          <div class="cal-semana">${SEMANA.map(s => `<span>${s}</span>`).join('')}</div>
          <div class="cal-grade">${cel.join('')}</div>
          <div class="row"><button type="button" class="btn small" data-d="${hojeIso()}">Hoje</button>
            ${op.limpar ? '<button type="button" class="btn small" data-d="">Limpar</button>' : ''}
            <button type="button" class="btn small" id="calFechar">Fechar</button></div>
        </div>`;
    };
    dlg.addEventListener('click', e => {
      if (e.target === dlg) { dlg.close(); return; }
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.id === 'calFechar') { dlg.close(); return; }
      if (b.dataset.m) {
        mes += Number(b.dataset.m);
        if (mes < 0) { mes = 11; ano--; } else if (mes > 11) { mes = 0; ano++; }
        desenhar();
        return;
      }
      if (b.dataset.d !== undefined) { escolhido = b.dataset.d; dlg.close(); }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(escolhido); });
    desenhar();
    dlg.showModal();
    (dlg.querySelector<HTMLButtonElement>('.cal-dia.atual') || dlg.querySelector<HTMLButtonElement>('.cal-dia.hoje'))?.focus();
  });
}

/** Troca um <input type="date"> pelo campo dd/mm/aaaa + calendário. */
function melhorar(orig: HTMLInputElement) {
  orig.dataset.feito = '1';
  const obrigatorio = orig.required;
  orig.required = false;          // escondido não pode ser obrigatório (o formulário não enviaria)
  orig.hidden = true;
  orig.tabIndex = -1;
  const txtId = `${orig.id || 'data'}-txt`;
  const caixa = document.createElement('div');
  caixa.className = 'campo-data';
  caixa.innerHTML = `<input type="text" id="${esc(txtId)}" inputmode="numeric" autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10"${obrigatorio ? ' required' : ''} value="${esc(isoParaBr(orig.value))}">
    <button type="button" class="cal-abrir" aria-label="Abrir calendário">${ICONE_CAL}</button>`;
  orig.insertAdjacentElement('afterend', caixa);
  if (orig.id) document.querySelectorAll<HTMLLabelElement>(`label[for="${orig.id}"]`).forEach(l => (l.htmlFor = txtId));
  const txt = caixa.querySelector('input')!;
  const titulo = (orig.id && document.querySelector(`label[for="${txtId}"]`)?.textContent?.trim()) || 'Data';

  const gravar = (iso: string) => {
    if (orig.value === iso) return;
    orig.value = iso;
    orig.dispatchEvent(new Event('input', { bubbles: true }));
    orig.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const conferir = (final: boolean) => {
    const v = txt.value.trim();
    if (!v) { txt.setCustomValidity(''); caixa.classList.remove('invalida'); gravar(''); return; }
    const iso = brParaIso(v);
    if (iso) { txt.setCustomValidity(''); caixa.classList.remove('invalida'); gravar(iso); return; }
    txt.setCustomValidity('Data inválida: use dd/mm/aaaa.');
    if (final) caixa.classList.add('invalida');
  };
  txt.addEventListener('input', () => {
    const m = mascara(txt.value);
    if (m !== txt.value) txt.value = m;
    conferir(false);
  });
  txt.addEventListener('blur', () => conferir(true));
  caixa.querySelector<HTMLButtonElement>('.cal-abrir')!.onclick = async () => {
    const r = await escolherData(orig.value, { titulo, limpar: !obrigatorio });
    if (r === null) return;
    txt.value = isoParaBr(r);
    conferir(true);
  };
}

/** Liga a troca para todos os campos de data, inclusive os que aparecem depois (telas novas). */
export function ativarDatas() {
  const varrer = (raiz: ParentNode) => raiz.querySelectorAll<HTMLInputElement>('input[type="date"]:not([data-feito])').forEach(melhorar);
  varrer(document);
  new MutationObserver(ms => {
    for (const m of ms) m.addedNodes.forEach(n => { if (n instanceof HTMLElement) { if (n.matches('input[type="date"]:not([data-feito])')) melhorar(n as HTMLInputElement); else varrer(n); } });
  }).observe(document.body, { childList: true, subtree: true });
}
