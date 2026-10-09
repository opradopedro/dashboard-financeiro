import './style.css';
import { atualizarEstado, aoMudar, consumirFila, enviarPacotes, iniciarDados, state } from './app';
import { nativo } from './nativo/notificacoes';
import { $, $$, toast } from './ui/fmt';
import { ABAS, aba, ir, rotaAtual, voltar, type Rota } from './ui/nav';
import { mudarMes, telaCategoria, telaFora, telaPainel, telaSemCategoria } from './ui/painel';
import { telaTransacoes, telaTx } from './ui/transacoes';
import { telaNotif, telaNotificacoes, telaSimular } from './ui/notificacoes';
import { telaRegra, telaRegras } from './ui/regras';
import { telaConferencia, telaImportar, telaRevisao } from './ui/importar';
import { telaApps, telaAjustes, telaBoasVindas, telaCategorias, telaConta, telaContas, telaDados, telaRegrasCat } from './ui/ajustes';

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
  regras: { titulo: 'Regras de notificação', render: el => telaRegras(el), vivo: true },
  regra: { titulo: r => (r.params[0] === 'nova' ? 'Nova regra' : 'Editar regra'), render: (el, r) => telaRegra(el, r.params[0], r) },
  revisao: { titulo: 'Revisão', render: el => telaRevisao(el), vivo: true },
  conferencia: { titulo: 'Conferência mensal', render: telaConferencia, vivo: true },
  apps: { titulo: 'Apps monitorados', render: el => telaApps(el) },
  contas: { titulo: 'Contas', render: el => telaContas(el), vivo: true },
  conta: { titulo: r => (r.params[0] === 'nova' ? 'Nova conta' : 'Conta'), render: (el, r) => telaConta(el, r.params[0] === 'nova' ? '' : r.params[0]) },
  categorias: { titulo: 'Categorias', render: el => telaCategorias(el) },
  regrascat: { titulo: 'Regras de categoria', render: el => telaRegrasCat(el), vivo: true },
  dados: { titulo: 'Dados', render: el => telaDados(el) },
  boasvindas: { titulo: 'Permissões', render: el => telaBoasVindas(el), vivo: true },
};

function render(anim = true) {
  const r = rotaAtual();
  const t = TELAS[r.nome] || TELAS[''];
  const el = $('#view');
  const ehAba = ABAS.includes(r.nome);
  $('#title').textContent = typeof t.titulo === 'function' ? t.titulo(r) : t.titulo;
  $('#btnVoltar').hidden = ehAba;
  $$('nav button').forEach(b => b.setAttribute('aria-current', b.dataset.aba!.split('?')[0] === r.nome ? 'page' : 'false'));
  try { t.render(el, r); } catch (e) { console.error(e); el.innerHTML = `<div class="panel"><div class="err">Erro ao abrir esta tela: ${(e as Error).message}</div></div>`; }
  if (anim) { el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim'); }
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
  await iniciarDados();
  aoMudar(() => {
    const t = TELAS[rotaAtual().nome];
    if (t?.vivo) render(false);
  });
  await enviarPacotes().catch(console.error);
  await atualizarEstado();
  await nativo.addListener('notificacao', () => verificarFila(true));
  await nativo.addListener('retomou', async () => { await atualizarEstado(); await verificarFila(true); if (TELAS[rotaAtual().nome]?.vivo) render(false); });
  await nativo.addListener('voltar', voltar);
  if (!state.dados.config.boasVindasVista && rotaAtual().nome === '') location.replace('#/boasvindas');
  ultimaRota = location.hash;
  render();
  await verificarFila(true);
  $('#carregando').hidden = true;
}

iniciar().catch(e => {
  console.error(e);
  $('#carregando').textContent = 'Não consegui abrir os dados: ' + (e as Error).message;
});
