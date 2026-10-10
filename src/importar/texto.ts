/**
 * Decodifica o arquivo. Ordem: UTF-16 (com marca BOM, ou sem marca mas com bytes zero intercalados,
 * como exportam alguns apps e o Excel "Texto Unicode"), UTF-8 se for válido, senão Windows-1252
 * (comum em extratos de bancos brasileiros).
 */
export function decodificar(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const limpar = (s: string) => s.replace(/^\ufeff/, '').replace(/\u0000/g, '');
  if (b[0] === 0xff && b[1] === 0xfe) return limpar(new TextDecoder('utf-16le').decode(b.subarray(2)));
  if (b[0] === 0xfe && b[1] === 0xff) return limpar(new TextDecoder('utf-16be').decode(b.subarray(2)));
  const u16 = utf16SemMarca(b);
  if (u16) return limpar(new TextDecoder(u16).decode(b));
  try { return limpar(new TextDecoder('utf-8', { fatal: true }).decode(b)); }
  catch { return limpar(new TextDecoder('windows-1252').decode(b)); }
}

/** UTF-16 sem marca: no texto comum, quase todo segundo byte é zero (nas posições ímpares = LE). */
function utf16SemMarca(b: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const n = Math.min(b.length - (b.length % 2), 400);
  if (n < 8) return null;
  let par = 0, impar = 0;
  for (let i = 0; i < n; i += 2) { if (b[i] === 0) par++; if (b[i + 1] === 0) impar++; }
  const metade = n / 2;
  if (impar > metade * 0.6 && par < metade * 0.1) return 'utf-16le';
  if (par > metade * 0.6 && impar < metade * 0.1) return 'utf-16be';
  return null;
}
