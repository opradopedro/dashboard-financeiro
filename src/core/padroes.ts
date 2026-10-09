// Valores iniciais (todos editáveis no app). Nada aqui é dado pessoal: são as contas e apps mais
// comuns e um ponto de partida para as regras, que você ajusta com as notificações reais.
import type { AppMonitorado, Categoria, Conta, Dados, RegraNotif } from './tipos';

export const CONTAS_INICIAIS: Conta[] = [
  { id: 'mercadopago-conta', nome: 'Mercado Pago conta', banco: 'Mercado Pago', tipo: 'corrente', ativa: true },
  { id: 'mercadopago-cartao', nome: 'Mercado Pago crédito', banco: 'Mercado Pago', tipo: 'cartao', ativa: true },
  { id: 'nubank-cartao', nome: 'Nubank crédito', banco: 'Nubank', tipo: 'cartao', ativa: true },
  { id: 'rico-cartao', nome: 'Rico crédito', banco: 'Rico', tipo: 'cartao', ativa: true },
  { id: 'flash', nome: 'Flash alimentação', banco: 'Flash', tipo: 'corrente', ativa: true },
];

/** Pacotes conferidos na Google Play (desenvolvedores Mercado Libre, Nu, RICO.COM.VC e Flash Pay). */
export const APPS_INICIAIS: AppMonitorado[] = [
  { pacote: 'com.mercadopago.wallet', nome: 'Mercado Pago', ativo: true },
  { pacote: 'com.nu.production', nome: 'Nubank', ativo: true },
  { pacote: 'br.com.rico.mobile', nome: 'Rico', ativo: true },
  { pacote: 'br.com.flashapp', nome: 'Flash', ativo: true, conta: 'flash' },
];

// Categorização automática por palavras (vinda do carteira). Vence a palavra mais longa encontrada.
const g = (nome: string, palavras: string): Categoria => ({ nome, receita: false, palavras: palavras.split(',').map(s => s.trim()).filter(Boolean) });
const r = (nome: string, palavras: string): Categoria => ({ ...g(nome, palavras), receita: true });

export const CATEGORIAS_INICIAIS: Categoria[] = [
  g('Alimentação', 'ifood, rappi, ze delivery, aiqfome, restaurante, lanchonete, padaria, panificadora, burger, pizza, pizzaria, mcdonald*, bobs, subway, starbucks, cafeteria, cafe, emporio, confeitaria, doceria, doces, churrascaria, sorvete*, acai, boteco, sushi, food'),
  g('Mercado', 'supermercado, supermerc*, mercado, mercearia, atacadao, atacadista, assai, carrefour, pao de acucar, hortifruti, sacolao, dia supermercado, makro, tenda, savegnago, condor, zaffari'),
  g('Transporte', 'uber, 99app, 99 app, 99 pop, 99pop, cabify, indriver, posto, combustiv*, shell, ipiranga, petrobras br, ale combust*, estacionamento, estapar, raizen, auto posto, sem parar, veloe, conectcar, metro, cptm, onibus, bilhete unico, top transporte, recarga bu'),
  g('Moradia', 'aluguel, condominio, iptu, quinto andar, quintoandar'),
  g('Contas da casa', 'enel, light, cemig, copel, celesc, coelba, energia, eletropaulo, sabesp, copasa, cedae, saneamento, agua, comgas, gas natural, claro, vivo, oi fibra, net servicos, internet, telefonica, tim'),
  g('Saúde', 'farmacia, drogaria, droga raia, drogasil, pague menos, panvel, hospital, clinica, laboratorio, exame, unimed, amil, hapvida, odonto*, dentista, smart fit, smartfit, academia, bluefit, gympass, wellhub, totalpass'),
  g('Educação', 'escola, colegio, faculdade, universidade, curso, udemy, alura, coursera, livraria'),
  g('Lazer', 'cinema, cinemark, ingresso*, sympla, eventim, teatro, steam, playstation, xbox, nintendo'),
  g('Compras', 'mercado livre, mercadolivre, meli, shopee, amazon, aliexpress, magalu, magazine luiza, americanas, shein, renner, riachuelo, c&a, zara, centauro, netshoes, kabum, casas bahia, ponto frio, leroy, tok stok, decathlon, papelaria, kalunga, petz, cobasi, pet shop'),
  g('Assinaturas', 'netflix, spotify, disney, prime video, amazon prime, youtube, google one, icloud, apple com, hbo, max com, deezer, globoplay, paramount, crunchyroll, chatgpt, openai, claude, anthropic, microsoft, adobe, canva'),
  g('Viagem', 'airbnb, booking, hotel, pousada, latam, gol linhas, azul linhas, decolar, 123milhas, smiles, rodoviaria, buser'),
  g('Serviços', 'barbearia, salao, lavanderia, manutencao, conserto'),
  g('Taxas e juros', 'iof, tarifa, anuidade, juros, multa, encargo, encargos'),
  g('Impostos', 'darf, ipva, imposto, receita federal, detran, licenciamento'),
  g('Seguros', 'seguro, seguradora, porto seguro, azul seguros'),
  g('Doações', 'doacao, vakinha'),
  g('Apostas', 'bet, aposta, loteria, lotofacil, mega sena, blaze, betano, bet365, sportingbet, pixbet, esportes da sorte'),
  g('Transferências', 'pix, ted, doc, transferencia, transf, boleto'),
  g('Outros', ''),
  r('Salário', 'salario, folha de pagamento, pagamento de salario, proventos salario, adiantamento salarial'),
  r('Rendimentos', 'rendimento, rendimentos, juros sobre capital, dividendo, remuneracao'),
  r('Outras receitas', ''),
];

// Partes reaproveitadas nos padrões abaixo.
// Valor: "R$ 1.234,56", "R$ 0,01" e também sem centavos ("Você recebeu R$ 1").
export const V = String.raw`R\$\s?(?<valor>\d[\d.]*(?:,\d{2})?)`;
const ATE_FIM = String.raw`[^.\n]+?`;

/**
 * Regras iniciais: CHUTE do formato das notificações. Ajuste com os textos reais (Notificações →
 * toque numa notificação → Criar regra), usando o teste ao vivo do editor.
 */
type Base = Omit<RegraNotif, 'origem' | 'criadaEm'>;
const regra = (r: Base): RegraNotif => ({ ...r, origem: 'padrao', criadaEm: '' });

export const REGRAS_INICIAIS: RegraNotif[] = ([
  // ---- Mercado Pago (conferidas com notificações reais: Pix recebido e depósito) ----
  { id: 'mp-pix-recebido', nome: 'MP: Pix/transferência recebida', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`(?:recebeu|recebido|recebemos)[\s\S]*?${V}(?:[\s\S]*?\b(?:que|de)\s+(?<desc>[^.\n]+?)(?:\s+te\s+(?:transferiu|enviou|pagou|mandou)|\.|\n|$))?`,
    descricao: 'Pix de {desc}', acao: 'entrada', sentido: 'entra', conta: 'mercadopago-conta', prioridade: 50, ativa: true },
  { id: 'mp-deposito', nome: 'MP: depósito seu (vindo de outra conta sua)', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`(?:voc[eê]\s+depositou|dep[oó]sito)[\s\S]*?${V}`,
    descricao: 'Depósito via Pix', acao: 'interna', sentido: 'entra', conta: 'mercadopago-conta', prioridade: 65, ativa: true },
  { id: 'mp-pix-enviado', nome: 'MP: Pix/transferência enviada', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`(?:enviou|enviado|enviamos|transfer[eê]ncia enviada|voc[eê] transferiu)[\s\S]*?${V}(?:[\s\S]*?\bpara\s+(?<desc>${ATE_FIM})(?:\.|\n|$))?`,
    descricao: 'Pix para {desc}', acao: 'saida', sentido: 'sai', conta: 'mercadopago-conta', prioridade: 50, ativa: true },
  { id: 'mp-reservado', nome: 'MP: dinheiro reservado (caixinha)', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`(?:reservou|reservado|guardou|guardado)[\s\S]*?${V}`,
    descricao: 'Dinheiro reservado', acao: 'caixinha', sentido: 'sai', conta: 'mercadopago-conta', prioridade: 60, ativa: true },
  { id: 'mp-retirado', nome: 'MP: dinheiro retirado da reserva', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`(?:retirou|retirado|resgatou|resgatado)[\s\S]*?${V}`,
    descricao: 'Dinheiro retirado', acao: 'caixinha', sentido: 'entra', conta: 'mercadopago-conta', prioridade: 60, ativa: true },
  { id: 'mp-fatura', nome: 'MP: pagamento de fatura', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`(?:pag\w*[\s\S]*?fatura|fatura[\s\S]*?paga)[\s\S]*?${V}`,
    descricao: 'Pagamento de fatura', acao: 'fatura', sentido: 'sai', conta: 'mercadopago-conta', prioridade: 70, ativa: true },
  { id: 'mp-compra-credito', nome: 'MP: compra no crédito', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`^(?=[\s\S]*cr[ée]dito)[\s\S]*?(?:compra|pagamento)[\s\S]*?${V}(?:[\s\S]*?\bem\s+(?<desc>${ATE_FIM})(?:\s+com\b|\s+no\b|\.|\n|$))?`,
    descricao: '', acao: 'saida', sentido: 'sai', conta: 'mercadopago-cartao', prioridade: 40, ativa: true },
  { id: 'mp-compra-debito', nome: 'MP: compra com saldo/débito', pacote: 'com.mercadopago.wallet',
    padrao: String.raw`(?:compra|pagamento)[\s\S]*?${V}(?:[\s\S]*?\bem\s+(?<desc>${ATE_FIM})(?:\s+com\b|\s+no\b|\.|\n|$))?`,
    descricao: '', acao: 'saida', sentido: 'sai', conta: 'mercadopago-conta', prioridade: 30, ativa: true },

  // ---- Nubank (crédito) ----
  { id: 'nu-compra', nome: 'Nubank: compra no crédito', pacote: 'com.nu.production',
    padrao: String.raw`compra\s+(?:de\s+)?${V}[\s\S]*?aprovada\s+(?:em|no|na)\s+(?<desc>[\s\S]+?)(?:\s+para o cart[aã]o|\.|\n|$)`,
    descricao: '', acao: 'saida', sentido: 'sai', conta: 'nubank-cartao', prioridade: 50, ativa: true },
  { id: 'nu-estorno', nome: 'Nubank: estorno', pacote: 'com.nu.production',
    padrao: String.raw`estorn\w*[\s\S]*?${V}(?:[\s\S]*?\b(?:em|de)\s+(?<desc>${ATE_FIM})(?:\.|\n|$))?`,
    descricao: 'Estorno {desc}', acao: 'saida', sentido: 'entra', conta: 'nubank-cartao', prioridade: 60, ativa: true },
  { id: 'nu-pagamento', nome: 'Nubank: pagamento da fatura recebido', pacote: 'com.nu.production',
    padrao: String.raw`pagamento[\s\S]*?(?:recebido|recebemos|fatura)[\s\S]*?${V}`,
    descricao: 'Pagamento recebido', acao: 'fatura', sentido: 'entra', conta: 'nubank-cartao', prioridade: 55, ativa: true },
  // Conferida com notificação real: "Transferência recebida / Recebemos sua transferência de R$ 0,01."
  // É dinheiro seu entrando na conta Nubank, que não está entre as contas acompanhadas.
  { id: 'nu-transferencia-sua', nome: 'Nubank: transferência sua para a conta Nubank (ignorada)', pacote: 'com.nu.production',
    padrao: String.raw`recebemos\s+sua\s+transfer[eê]ncia`,
    descricao: '', acao: 'ignorar', sentido: 'entra', conta: 'nubank-cartao', prioridade: 70, ativa: true },

  // ---- Rico (só o cartão; investimentos ficam de fora) ----
  { id: 'rico-investimentos', nome: 'Rico: ignorar investimentos', pacote: 'br.com.rico.mobile',
    padrao: String.raw`aplica|resgat|ordem|dividend|rendiment|provent|tesouro|\bcdb\b|\blci\b|\blca\b|fundo|a[cç](?:ão|ões|oes)\b|investim|corretag|\bjcp\b|cust[oó]dia|carteira|preg[aã]o|bolsa`,
    descricao: '', acao: 'ignorar', sentido: 'sai', conta: 'rico-cartao', prioridade: 90, ativa: true },
  { id: 'rico-compra', nome: 'Rico: compra no crédito', pacote: 'br.com.rico.mobile',
    padrao: String.raw`(?:compra|transa[cç][aã]o)[\s\S]*?${V}(?:[\s\S]*?\b(?:em|no|na)\s+(?<desc>${ATE_FIM})(?:\s+com\b|\s+no cart|\.|\n|$))?`,
    descricao: '', acao: 'saida', sentido: 'sai', conta: 'rico-cartao', prioridade: 50, ativa: true },

  // ---- Flash (vale alimentação/refeição) — conferida com notificações reais ----
  // "Compra aprovada no crédito|voucher / Compra de R$ 32,00 em CAFE CENTRAL EMPORIO realizada. Seu saldo…"
  { id: 'flash-compra', nome: 'Flash: compra', pacote: 'br.com.flashapp',
    padrao: String.raw`compra\s+(?:de\s+)?${V}\s+(?:em|no|na)\s+(?<desc>.+?)(?:\s+realizad[ao]|\s+aprovad[ao]|\.|\n|$)`,
    descricao: '', acao: 'saida', sentido: 'sai', conta: 'flash', prioridade: 50, ativa: true },
] as Base[]).map(regra);

/** Versão atual dos dados (ver migracoes.ts). */
export const VERSAO_DADOS = 2;

export function dadosIniciais(): Dados {
  return {
    contas: CONTAS_INICIAIS.map(c => ({ ...c })),
    txs: [],
    notifs: [],
    apps: APPS_INICIAIS.map(a => ({ ...a })),
    regras: REGRAS_INICIAIS.map(r => ({ ...r })),
    categorias: CATEGORIAS_INICIAIS.map(c => ({ ...c, palavras: [...c.palavras] })),
    regrasCat: [],
    modelos: [],
    revisoes: [],
    importacoes: [],
    excluidas: [],
    config: { boasVindasVista: false, titular: '', avisos: 'sem-regra', versaoDados: VERSAO_DADOS },
  };
}
