// Leitor de CSV tolerante: detecta ; , ou tab, aceita aspas e quebras de linha dentro de aspas.

export function detectarSeparador(texto: string): string {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim()).slice(0, 15);
  let melhor = ';', pontos = -1;
  for (const sep of [';', ',', '\t', '|']) {
    const n = linhas.map(l => l.split(sep).length - 1);
    // Bom separador: aparece em quase todas as linhas, com contagem estável.
    const comSep = n.filter(x => x > 0);
    if (!comSep.length) continue;
    const moda = [...comSep].sort((a, b) => comSep.filter(x => x === b).length - comSep.filter(x => x === a).length)[0];
    const p = comSep.filter(x => x === moda).length * 10 + moda;
    if (p > pontos) { pontos = p; melhor = sep; }
  }
  return melhor;
}

export function lerCsv(texto: string, sep = detectarSeparador(texto)): string[][] {
  const out: string[][] = [];
  let linha: string[] = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"' && campo.trim() === '') { aspas = true; campo = ''; }
    else if (c === sep) { linha.push(campo.trim()); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo.trim()); campo = '';
      if (linha.some(x => x !== '')) out.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo.trim());
  if (linha.some(x => x !== '')) out.push(linha);
  return out;
}
