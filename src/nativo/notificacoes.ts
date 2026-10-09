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
  web?: boolean;        // rodando no navegador, sem Android
}

export interface ItemNativo extends ItemFila { id: number }

interface PluginNotificacoes {
  estado(): Promise<EstadoNativo>;
  definirPacotes(o: { pacotes: string[] }): Promise<void>;
  lerFila(): Promise<{ itens: ItemNativo[] }>;
  confirmar(o: { ids: number[] }): Promise<void>;
  simular(o: { pacote: string; titulo: string; texto: string }): Promise<{ aceita: boolean }>;
  abrirAcessoNotificacoes(): Promise<void>;
  abrirInfoApp(): Promise<void>;
  pedirBateria(): Promise<void>;
  religar(): Promise<void>;
  sair(): Promise<void>;
  salvarArquivo(o: { nome: string; mime: string; conteudo: string }): Promise<{ salvo: boolean }>;
  addListener(ev: 'notificacao' | 'retomou' | 'voltar', f: () => void): Promise<PluginListenerHandle>;
}

/** Imitação para o navegador: mesma interface, fila em memória. */
function imitacao(): PluginNotificacoes {
  let pacotes: string[] = [];
  let seq = 0;
  const fila: ItemNativo[] = [];
  const ouvintes = new Map<string, Set<() => void>>();
  const emitir = (ev: string) => ouvintes.get(ev)?.forEach(f => setTimeout(f));
  const nada = async () => { alert('Disponível só no app instalado no Android.'); };
  return {
    estado: async () => ({ acessoPermitido: false, servicoConectado: false, bateriaLiberada: false, android: 0, fabricante: 'navegador', pendentes: fila.length, pacotes, web: true }),
    definirPacotes: async o => { pacotes = o.pacotes; },
    lerFila: async () => ({ itens: fila.map(x => ({ ...x })) }),
    confirmar: async o => { for (const id of o.ids) { const i = fila.findIndex(x => x.id === id); if (i >= 0) fila.splice(i, 1); } },
    simular: async o => {
      if (!pacotes.includes(o.pacote) || (!o.titulo.trim() && !o.texto.trim())) return { aceita: false };
      fila.push({ id: ++seq, chave: `sim-${Date.now()}-${seq}`, pacote: o.pacote, titulo: o.titulo, texto: o.texto, quando: Date.now(), simulada: true });
      emitir('notificacao');
      return { aceita: true };
    },
    abrirAcessoNotificacoes: nada, abrirInfoApp: nada, pedirBateria: nada, religar: async () => {}, sair: async () => {},
    salvarArquivo: async o => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([o.conteudo], { type: o.mime }));
      a.download = o.nome; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return { salvo: true };
    },
    addListener: async (ev, f) => {
      if (!ouvintes.has(ev)) ouvintes.set(ev, new Set());
      ouvintes.get(ev)!.add(f);
      return { remove: async () => { ouvintes.get(ev)?.delete(f); } };
    },
  };
}

export const ehAndroid = Capacitor.getPlatform() === 'android';
export const nativo: PluginNotificacoes = ehAndroid ? registerPlugin<PluginNotificacoes>('Notificacoes') : imitacao();
