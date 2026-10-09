// Ponte com o plugin Kotlin (android/app/src/main/java/app/dashboardfinanceiro/notificacoes/).
// No navegador (desenvolvimento), uma imitação em memória faz o mesmo papel, inclusive o filtro de pacotes.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { ItemFila } from '../core/ingestao';

export interface EstadoNativo {
  acessoPermitido: boolean;
  servicoConectado: boolean;
  bateriaLiberada: boolean;
  android: number;      // versão da API (33 = Android 13)
  fabricante: string;
  pendentes: number;
  pacotes: string[];
  avisosPermitidos: boolean; // o Android deixa o app mostrar notificações (avisos Ignorar/Adicionar)
  web?: boolean;        // rodando no navegador, sem Android
}

/** Botão tocado num aviso (Ignorar/Adicionar), guardado no Android até o app abrir. */
export interface DecisaoNativa { id: number; chave: string; acao: 'adicionar' | 'ignorar'; em: number }

/** Cópia das regras para o Android decidir o aviso com o app fechado. */
export interface RegraParaNativo { pacote: string; padrao: string; acao: string }

export interface ItemNativo extends ItemFila { id: number }

interface PluginNotificacoes {
  estado(): Promise<EstadoNativo>;
  definirPacotes(o: { pacotes: string[] }): Promise<void>;
  lerFila(): Promise<{ itens: ItemNativo[] }>;
  confirmar(o: { ids: number[] }): Promise<void>;
  simular(o: { pacote: string; titulo: string; texto: string }): Promise<{ aceita: boolean; chave?: string }>;
  definirRegras(o: { regras: RegraParaNativo[]; nomes: Record<string, string>; modo: string }): Promise<void>;
  lerDecisoes(): Promise<{ itens: DecisaoNativa[] }>;
  confirmarDecisoes(o: { ids: number[] }): Promise<void>;
  cancelarAvisos(o: { chaves: string[] }): Promise<void>;
  pedirPermissaoAvisos(): Promise<{ permitido: boolean }>;
  abrirConfigAvisos(): Promise<void>;
  rotaInicial(): Promise<{ rota: string }>;
  abrirAcessoNotificacoes(): Promise<void>;
  abrirInfoApp(): Promise<void>;
  pedirBateria(): Promise<void>;
  religar(): Promise<void>;
  sair(): Promise<void>;
  salvarArquivo(o: { nome: string; mime: string; conteudo: string }): Promise<{ salvo: boolean }>;
  addListener(ev: 'notificacao' | 'retomou' | 'voltar', f: () => void): Promise<PluginListenerHandle>;
  addListener(ev: 'abrir', f: (o: { rota: string }) => void): Promise<PluginListenerHandle>;
}

/** Imitação para o navegador: mesma interface, fila em memória. */
function imitacao(): PluginNotificacoes {
  let pacotes: string[] = [];
  let seq = 0;
  const fila: ItemNativo[] = [];
  const ouvintes = new Map<string, Set<(o?: unknown) => void>>();
  const emitir = (ev: string) => ouvintes.get(ev)?.forEach(f => setTimeout(f));
  const nada = async () => { alert('Disponível só no app instalado no Android.'); };
  return {
    estado: async () => ({ acessoPermitido: false, servicoConectado: false, bateriaLiberada: false, android: 0, fabricante: 'navegador', pendentes: fila.length, pacotes, avisosPermitidos: false, web: true }),
    definirPacotes: async o => { pacotes = o.pacotes; },
    lerFila: async () => ({ itens: fila.map(x => ({ ...x })) }),
    confirmar: async o => { for (const id of o.ids) { const i = fila.findIndex(x => x.id === id); if (i >= 0) fila.splice(i, 1); } },
    simular: async o => {
      if (!pacotes.includes(o.pacote) || (!o.titulo.trim() && !o.texto.trim())) return { aceita: false };
      const chave = `sim-${Date.now()}-${seq + 1}`;
      fila.push({ id: ++seq, chave, pacote: o.pacote, titulo: o.titulo, texto: o.texto, quando: Date.now(), simulada: true });
      emitir('notificacao');
      return { aceita: true, chave };
    },
    definirRegras: async () => {},
    lerDecisoes: async () => ({ itens: [] }),
    confirmarDecisoes: async () => {},
    cancelarAvisos: async () => {},
    pedirPermissaoAvisos: async () => ({ permitido: false }),
    abrirConfigAvisos: nada,
    rotaInicial: async () => ({ rota: '' }),
    abrirAcessoNotificacoes: nada, abrirInfoApp: nada, pedirBateria: nada, religar: async () => {}, sair: async () => {},
    salvarArquivo: async o => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([o.conteudo], { type: o.mime }));
      a.download = o.nome; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return { salvo: true };
    },
    addListener: (async (ev: string, f: (o?: unknown) => void) => {
      if (!ouvintes.has(ev)) ouvintes.set(ev, new Set());
      ouvintes.get(ev)!.add(f);
      return { remove: async () => { ouvintes.get(ev)?.delete(f); } };
    }) as PluginNotificacoes['addListener'],
  };
}

export const ehAndroid = Capacitor.getPlatform() === 'android';
export const nativo: PluginNotificacoes = ehAndroid ? registerPlugin<PluginNotificacoes>('Notificacoes') : imitacao();
