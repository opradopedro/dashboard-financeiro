// Armazenamento local (IndexedDB do WebView). Tudo num único registro, gravado inteiro a cada mudança:
// simples e atômico (ou grava tudo, ou nada).
import { openDB, type IDBPDatabase } from 'idb';
import type { Dados } from '../core/tipos';
import { sanear } from '../core/backup';

let dbp: Promise<IDBPDatabase> | null = null;
const db = () => (dbp ||= openDB('dashboard-financeiro', 1, { upgrade(d) { d.createObjectStore('kv'); } }));

export async function carregar(): Promise<Dados> {
  // Pede ao navegador para não apagar os dados quando faltar espaço.
  try { await navigator.storage?.persist?.(); } catch { /* sem suporte */ }
  return sanear(await (await db()).get('kv', 'dados'));
}

export async function gravar(d: Dados): Promise<void> {
  await (await db()).put('kv', d, 'dados');
}
