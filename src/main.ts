import '@fontsource-variable/montserrat/wght.css';
// Montserrat Alternates (variação da Montserrat) nos títulos e no nome do mês.
import '@fontsource/montserrat-alternates/latin-200.css';
import '@fontsource/montserrat-alternates/latin-ext-200.css';
import '@fontsource/montserrat-alternates/latin-500.css';
import '@fontsource/montserrat-alternates/latin-ext-500.css';
import '@fontsource/montserrat-alternates/latin-600.css';
import '@fontsource/montserrat-alternates/latin-ext-600.css';
import './style.css';
import { atualizarEstado, aoMudar, consumirFila, iniciarDados, sincronizarNativo, state } from './app';
import { ICONES } from './ui/icones';
import { nativo } from './nativo/notificacoes';
import { $, $$, toast } from './ui/fmt';
import { ABAS, aba, ir, rotaAtual, voltar, type Rota } from './ui/nav';
import { mudarMes, telaCategoria, telaFora, telaPainel, telaSemCategoria } from './ui/painel';
import { telaTransacoes, telaTx } from './ui/transacoes';
import { telaNotif, telaNotificacoes, telaSimular } from './ui/notificacoes';
import { telaRegra, telaRegras } from './ui/regras';
import { telaConferencia, telaImportar, telaRevisao, telaImportacao } from './ui/importar';
import { telaApps, telaAjustes, telaBoasVindas, telaCategorias, telaConta, telaContas, telaDados } from './ui/ajustes';
import { telaNovidades } from './ui/novidades';
import { ativarSelects } from './ui/escolher';

interface Tela { titulo: string | ((r: Rota) => string); render: (el: HTMLElement, r: Rota) => void; vivo?: boolean }

// vivo: a tela é refeita sozinha quando os dados mudam (ex.: chegou notificação). Telas de formulário não.
const TELAS: Record<string, Tela> = {
  '': { titulo: 'Painel', render: el => telaPainel(el), vivo: true },
  transacoes: { titulo: 'Transações', render: telaTransacoes, vivo: true },
  notificacoes: { titulo: 'Notificações', render: telaNotificacoes, vivo: true },
  importar: { titulo: 'Importar', render: el => telaImportar(el) },
  ajustes: { titulo: 'Ajustes', render: el => telaAjustes(el), vivo: true },
  tx: { titulo: r => (r.params[0] === 'novo' ? 'Lançar' : 'Transação'), render: (el, r) => telaTx(el, r.params[0]) },
  cat: { titulo: r => r.params[0], render: (el, r) => telaCategoria(el, r.params[0]), vivo: true },
  semcat: { titulo: 'Sem categoria', render: el => telaSemCategoria(el), vivo: true },
  fora: { titulo: 'Não contam', render: el => telaFora(el), vivo: true },
  notif: { titulo: 'Notificação', render: (el, r) => telaNotif(el, r.params[0]), vivo: true },
  simular: { titulo: 'Simular notificação', render: el => telaSimular(el) },
  regras: { titulo: 'Regras', render: telaRegras, vivo: true },
  regra: { titulo: r => (r.params[0] === 'nova' ? 'Nova regra' : 'Editar regra'), render: (el, r) => telaRegra(el, r.params[0], r) },
  importacao: { titulo: 'Arquivo importado', render: (el, r) => telaImportacao(el, r.params[0]), vivo: true },
  revisao: { titulo: 'Revisão', render: el => telaRevisao(el), vivo: true },
  conferencia: { titulo: 'Conferência mensal', render: telaConferencia, vivo: true },
  apps: { titulo: 'Apps monitorados', render: el => telaApps(el) },
  contas: { titulo: 'Contas', render: el => telaContas(el), vivo: true },
  conta: { titulo: r => (r.params[0] === 'nova' ? 'Nova conta' : 'Conta'), render: (el, r) => telaConta(el, r.params[0] === 'nova' ? '' : r.params[0]) },
  categorias: { titulo: 'Categorias', render: el => telaCategorias(el) },
  regrascat: { titulo: 'Regras', render: el => telaRegras(el, { nome: 'regras', params: [], query: new URLSearchParams('tipo=cat') }), vivo: true },
  dados: { titulo: 'Dados', render: el => telaDados(el) },
  novidades: { titulo: 'Novidades', render: el => telaNovidades(el) },
  boasvindas: { titulo: 'Permissões', render: el => telaBoasVindas(el), vivo: true },
};

function render(anim = true) {
  const r = rotaAtual();
  const t = TELAS[r.nome] || TELAS[''];
  const el = $('#view');
  const ehAba = ABAS.includes(r.nome);
  // No Painel o nome do mês é o título; o cabeçalho fica vazio.
  $('#title').textContent = r.nome === '' ? '' : typeof t.titulo === 'function' ? t.titulo(r) : t.titulo;
  $('#btnVoltar').hidden = ehAba;
  $$('nav button').forEach(b => b.setAttribute('aria-current', b.dataset.aba!.split('?')[0] === r.nome ? 'page' : 'false'));
  marcarPendencias();
  try { t.render(el, r); } catch (e) { console.error(e); el.innerHTML = `<div class="panel"><div class="err">Erro ao abrir esta tela: ${(e as Error).message}</div></div>`; }
  if (anim) { el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim'); }
  // Telas que mostram o estado do serviço: relê do Android ao abrir (a permissão pode ter mudado lá fora).
  if (anim && (r.nome === 'ajustes' || r.nome === 'boasvindas')) {
    const antes = JSON.stringify(state.nativo);
    void atualizarEstado().then(n => { if (JSON.stringify(n) !== antes && rotaAtual().nome === r.nome) render(false); });
  }
}

/** Número na aba Notificações: as que esperam regra; e na aba Importar: linhas em revisão. */
function marcarPendencias() {
  const d = state.dados;
  const conta: Record<string, number> = {
    notificacoes: d.notifs.filter(n => n.status === 'sem-regra' || n.status === 'erro').length,
    importar: d.revisoes.length,
  };
  $$('nav button').forEach(b => {
    const n = conta[b.dataset.aba || ''] || 0;
    let el = b.querySelector('.num');
    if (!n) { el?.remove(); return; }
    if (!el) { el = document.createElement('span'); el.className = 'num'; b.appendChild(el); }
    el.textContent = n > 99 ? '99+' : String(n);
  });
}

let ultimaRota = '';
addEventListener('hashchange', () => {
  const h = location.hash;
  render(h !== ultimaRota);
  if (h.split('?')[0] !== ultimaRota.split('?')[0]) scrollTo(0, 0);
  ultimaRota = h;
});
addEventListener('rerender', () => render(false));

// Navegação por atributos: data-ir (página), data-aba (troca de aba), data-mes-mudar.
document.addEventListener('click', e => {
  const alvo = (e.target as HTMLElement).closest<HTMLElement>('[data-ir],[data-aba],[data-mes-mudar],#btnVoltar');
  if (!alvo) return;
  if (alvo.id === 'btnVoltar') { voltar(); return; }
  if (alvo.dataset.mesMudar) { mudarMes(+alvo.dataset.mesMudar); render(false); return; }
  e.preventDefault();
  if (alvo.dataset.ir != null) ir(alvo.dataset.ir);
  else if (alvo.dataset.aba != null) aba(alvo.dataset.aba);
});

async function verificarFila(avisar: boolean) {
  try {
    const n = await consumirFila();
    if (n && avisar) toast(n === 1 ? '1 notificação nova' : `${n} notificações novas`);
  } catch (e) { console.error(e); }
}

async function iniciar() {
  // Ícones da navegação e do voltar.
  $$('nav button').forEach(b => b.insertAdjacentHTML('afterbegin', ICONES[b.dataset.icone as keyof typeof ICONES] || ''));
  $('#btnVoltar').innerHTML = ICONES.voltar;
  ativarSelects();
  await iniciarDados();
  aoMudar(() => {
    const t = TELAS[rotaAtual().nome];
    // Com uma folha de escolha aberta, não refaz a tela (perderia o que estava sendo preenchido).
    if (t?.vivo && !document.querySelector('dialog[open]')) render(false); else marcarPendencias();
    void sincronizarNativo().catch(console.error);
  });
  await sincronizarNativo().catch(console.error);
  await atualizarEstado();
  await nativo.addListener('notificacao', () => verificarFila(true));
  await nativo.addListener('retomou', async () => { await atualizarEstado(); await verificarFila(true); if (TELAS[rotaAtual().nome]?.vivo) render(false); });
  await nativo.addListener('voltar', voltar);
  // Toque num aviso do app: abre a notificação correspondente.
  await nativo.addListener('abrir', async ({ rota }) => { await verificarFila(false); if (rota) ir(rota); });
  if (!state.dados.config.boasVindasVista && rotaAtual().nome === '') location.replace('#/boasvindas');
  const { rota } = await nativo.rotaInicial().catch(() => ({ rota: '' }));
  ultimaRota = location.hash;
  render();
  await verificarFila(true);
  if (rota) ir(rota);
  $('#carregando').hidden = true;
}

iniciar().catch(e => {
  console.error(e);
  $('#carregando').textContent = 'Não consegui abrir os dados: ' + (e as Error).message;
});
