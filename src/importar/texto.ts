/** Decodifica o arquivo: UTF-8 se for válido; senão Windows-1252 (comum em extratos de bancos brasileiros). */
export function decodificar(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(b); }
}
