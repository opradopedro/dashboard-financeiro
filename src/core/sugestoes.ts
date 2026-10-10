// Sugestões que o app tira dos seus dados (você confirma): seu nome como aparece nos bancos e o
// gasto que uma entrada pode estar reembolsando.
import type { Classificada } from './classificar';
import type { Transacao } from './tipos';
import { diasEntre, norm } from './util';

const PIX = /^(?:pix|transferencia pix|transferencia|ted|doc)\s+(enviad[oa]|recebid[oa])(?:\s+(?:de|para|pelo pix))?\s+(.+)$/;

/**
 * Seu nome provável: o nome que aparece em Pix recebidos e também em Pix enviados, mais vezes
 * (pelo menos 3). Devolve como está escrito na descrição mais recente.
 */
export function sugerirTitular(txs: Transacao[]): string | null {
  const cont = new Map<string, { rec: number; env: number; escrito: string }>();
  for (const t of [...txs].sort((a, b) => a.data.localeCompare(b.data))) {
    const m = PIX.exec(norm(t.desc).trim());
    if (!m) continue;
    const nome = m[2].split(' ').filter(w => w && !/\d/.test(w)).join(' ');
    if (nome.split(' ').length < 3) continue;
    const c = cont.get(nome) || { rec: 0, env: 0, escrito: '' };
    if (m[1].startsWith('recebid')) c.rec++; else c.env++;
    // Mantém a escrita original (com acentos e maiúsculas) do trecho com o nome.
    const orig = t.desc.trim().split(/\s+/).slice(-nome.split(' ').length).join(' ');
    c.escrito = orig.replace(/\S+/g, w => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()));
    cont.set(nome, c);
  }
  const melhor = [...cont.values()].filter(c => c.rec > 0 && c.env > 0 && c.rec + c.env >= 3).sort((a, b) => b.rec + b.env - (a.rec + a.env))[0];
  return melhor?.escrito || null;
}

/** Valor perto o bastante para ser o mesmo dinheiro (até R$ 1 ou 1%). */
const perto = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.01);

/** Entrada que pode ser reembolso (não é salário, vale, rendimento nem já decidida). */
export const podeSerReembolso = (x: Classificada) =>
  x.t === 'entrada' && x.valor > 0 && x.reembolsa === undefined && !x.semReembolso && !['salario', 'voucher'].includes(x.fc) && x.c !== 'Rendimentos';

/**
 * Gastos que esta entrada pode estar reembolsando: valor parecido, de 60 dias antes até 30 dias
 * depois dela, ainda sem reembolso. Os de valor igual vêm primeiro.
 */
export function candidatosReembolso(cls: Classificada[], x: Classificada, max = 5): Classificada[] {
  return cls.filter(g => g.t === 'saida' && g.valor < 0 && !g.reembolsos?.length && perto(-g.valor, x.valor)
      && diasEntre(g.data, x.data) <= (g.data <= x.data ? 60 : 30))
    .sort((a, b) => Math.abs(-a.valor - x.valor) - Math.abs(-b.valor - x.valor) || diasEntre(a.data, x.data) - diasEntre(b.data, x.data))
    .slice(0, max);
}

/** Entradas com um gasto de valor igual por perto: o Painel pergunta se são reembolso. */
export function possiveisReembolsos(cls: Classificada[]) {
  return cls.filter(podeSerReembolso).map(x => ({ x, cands: candidatosReembolso(cls, x, 3).filter(g => Math.abs(-g.valor - x.valor) < 0.005) }))
    .filter(r => r.cands.length);
}
