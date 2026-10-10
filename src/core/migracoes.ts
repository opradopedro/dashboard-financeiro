// Migrações dos dados guardados no aparelho (e de backups antigos). Cada versão só acrescenta:
// nunca apaga o que você criou nem desfaz o que você editou.
import type { Dados } from './tipos';
import { APPS_INICIAIS, CAT_VOUCHER, CATEGORIAS_INICIAIS, CONTAS_INICIAIS, REGRAS_INICIAIS, VERSAO_DADOS } from './padroes';
import { reprocessar } from './ingestao';
import REGRAS_V1 from './regras-v1.json';

/** v1 → v2: Flash, regras conferidas com notificações reais, valores sem centavos. */
function v2(d: Dados): Dados {
  const v1 = REGRAS_V1 as Record<string, string>;
  const novas = new Map(REGRAS_INICIAIS.map(r => [r.id, r]));
  // Regras padrão que você não mexeu no padrão recebem a versão nova.
  let regras = d.regras.map(r => {
    const nova = novas.get(r.id);
    return nova && v1[r.id] === r.padrao ? { ...r, padrao: nova.padrao, descricao: nova.descricao, nome: nova.nome } : r;
  });
  const temApp = (p: string) => d.apps.some(a => a.pacote === p);
  const flashApp = APPS_INICIAIS.find(a => a.pacote === 'br.com.flashapp')!;
  const flashConta = CONTAS_INICIAIS.find(c => c.id === 'flash')!;
  const contas = d.contas.some(c => c.id === flashConta.id) || temApp(flashApp.pacote) ? d.contas : [...d.contas, { ...flashConta }];
  const apps = temApp(flashApp.pacote) ? d.apps : [...d.apps, { ...flashApp, conta: contas.some(c => c.id === 'flash') ? 'flash' : undefined }];
  // Regras padrão novas (só se a conta de destino existir).
  for (const r of REGRAS_INICIAIS) {
    if (v1[r.id] || regras.some(x => x.id === r.id) || !contas.some(c => c.id === r.conta)) continue;
    regras = [...regras, { ...r }];
  }
  // Palavras-chave novas das categorias que vieram com o app (as suas continuam).
  const cats = d.categorias.map(c => {
    const ini = CATEGORIAS_INICIAIS.find(x => x.nome === c.nome);
    return ini ? { ...c, palavras: [...c.palavras, ...ini.palavras.filter(p => !c.palavras.includes(p))] } : c;
  });
  return { ...d, contas, apps, regras, categorias: cats };
}

/** v2 → v3: categoria de entrada Voucher (crédito do vale). */
function v3(d: Dados): Dados {
  if (d.categorias.some(c => c.nome === CAT_VOUCHER)) return d;
  const voucher = CATEGORIAS_INICIAIS.find(c => c.nome === CAT_VOUCHER)!;
  // Entra depois de "Rendimentos" (ou no fim), junto das outras categorias de entrada.
  const i = d.categorias.findIndex(c => c.nome === 'Rendimentos');
  const categorias = [...d.categorias];
  categorias.splice(i >= 0 ? i + 1 : categorias.length, 0, { ...voucher, palavras: [...voucher.palavras] });
  return { ...d, categorias };
}

const PASSOS: [number, (d: Dados) => Dados][] = [[2, v2], [3, v3]];

/** Leva os dados até a versão atual. Depois de migrar, as notificações sem regra são reprocessadas. */
export function migrar(d: Dados): { dados: Dados; migrou: boolean } {
  let atual = d;
  for (const [versao, f] of PASSOS) if (atual.config.versaoDados < versao) atual = { ...f(atual), config: { ...atual.config, versaoDados: versao } };
  if (atual === d) return { dados: d, migrou: false };
  const pendentes = atual.notifs.filter(n => n.status === 'sem-regra' || n.status === 'erro').map(n => n.id);
  if (pendentes.length) atual = reprocessar(atual, pendentes);
  atual = { ...atual, config: { ...atual.config, versaoDados: Math.max(atual.config.versaoDados, VERSAO_DADOS) } };
  return { dados: atual, migrou: true };
}
