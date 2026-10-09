// Ícones de traço (24x24), desenhados para o app. Herdam a cor do texto.
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONES = {
  painel: svg('<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-7"/><path d="M21 20H3"/>'),
  transacoes: svg('<path d="M7 7h13"/><path d="M7 12h13"/><path d="M7 17h9"/><circle cx="3.5" cy="7" r=".6" fill="currentColor"/><circle cx="3.5" cy="12" r=".6" fill="currentColor"/><circle cx="3.5" cy="17" r=".6" fill="currentColor"/>'),
  notificacoes: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  importar: svg('<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 17v2.5h16V17"/>'),
  ajustes: svg('<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h4"/><path d="M12 17h8"/><circle cx="10" cy="17" r="2"/>'),
  voltar: svg('<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>'),
  antes: svg('<path d="m14.5 6-6 6 6 6"/>'),
  depois: svg('<path d="m9.5 6 6 6-6 6"/>'),
};
