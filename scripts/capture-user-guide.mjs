#!/usr/bin/env node
/**
 * Captura as telas do guia do usuario a partir da instancia em execucao.
 *
 *   node scripts/capture-user-guide.mjs            # captura tudo
 *   node scripts/capture-user-guide.mjs --only=quadro,loja
 *
 * O script nao apenas fotografa: para cada tela ele (a) verifica que a pagina
 * certa foi alcançada e (b) extrai do DOM os títulos, botões, abas, colunas e
 * links realmente exibidos. Esse extrato vai para docs/.build/screens/manifest.json
 * e é a fonte usada para escrever o guia — o texto do guia nomeia controles a
 * partir do que a interface mostra, não de suposição sobre o código.
 *
 * Credenciais: docs/.capture.env (gitignored). Nada é impresso.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, "docs", ".capture.env");
// As capturas são fonte do guia: vão para docs/screens/, que é versionado.
const OUT_DIR = join(ROOT, "docs", "screens");
// O extrato do DOM é subproduto da captura, não integra o guia.
const MANIFEST_FILE = join(ROOT, "docs", ".build", "screens", "manifest.json");

const log = (...a) => console.log("[captura]", ...a);
const die = (msg) => {
  console.error(`\n[captura] ERRO: ${msg}\n`);
  process.exit(1);
};

/* ------------------------------------------------------------------ */
/* credenciais                                                         */
/* ------------------------------------------------------------------ */

function readEnv() {
  let raw;
  try {
    raw = readFileSync(ENV_FILE, "utf8");
  } catch {
    die(`não encontrei ${ENV_FILE} — preencha as credenciais da conta de captura`);
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  if (!env.DQ_CAPTURE_URL || !env.DQ_CAPTURE_EMAIL || !env.DQ_CAPTURE_PASSWORD) {
    die("faltam DQ_CAPTURE_URL / DQ_CAPTURE_EMAIL / DQ_CAPTURE_PASSWORD em docs/.capture.env");
  }
  return env;
}

/* ------------------------------------------------------------------ */
/* as telas                                                            */
/* ------------------------------------------------------------------ */

/**
 * `expect` é a verificação de que a tela certa foi alcançada:
 *   url    — expressão que a URL final precisa satisfazer (senão: foi redirecionado)
 *   anyOf  — pelo menos um desses textos precisa aparecer na página
 */
const SCREENS = [
  // --- sem sessão ---
  { id: "tela-entrada", role: null, route: "/login", expect: { url: /\/login/, anyOf: ["Entrar", "Senha"] } },
  { id: "tela-cadastro", role: null, route: "/register", expect: { url: /\/register/, anyOf: ["Cadastro", "criar"] } },

  // --- coordenador: superficie completa ---
  { id: "quadro-tarefas", role: "coord", route: "/dashboard", expect: { url: /\/dashboard$/, anyOf: ["Quadro", "Tarefa"] } },
  { id: "resumo-home", role: "coord", route: "/dashboard", expect: { url: /\/dashboard$/, anyOf: ["Meta da semana", "Estatísticas do quadro"] }, capturarElemento: 'section[aria-label="Resumo do laboratório"]' },
  { id: "projetos", role: "coord", route: "/dashboard/projetos", aba: "Lista de Projetos", expect: { url: /\/dashboard\/projetos/, anyOf: ["Projeto"] } },
  { id: "laboratorio", role: "coord", route: "/dashboard/laboratorio", expect: { url: /\/dashboard\/laboratorio/, anyOf: ["Laboratório", "Plantão"] } },
  { id: "relatorios-semanais", role: "coord", route: "/dashboard/weekly-reports", expect: { url: /\/dashboard\/weekly-reports/, anyOf: ["Relatório"] } },
  { id: "painel-administrativo", role: "coord", route: "/dashboard/admin", expect: { url: /\/dashboard\/admin/, anyOf: ["Administrativo", "Usuário"] } },
  { id: "loja-gerenciar", role: "coord", route: "/dashboard/loja/gerenciar", expect: { url: /\/dashboard\/loja\/gerenciar/, anyOf: ["Loja", "Recompensa", "Compra"] } },
  { id: "perfil", role: "coord", route: "/dashboard/profile", expect: { url: /\/dashboard\/profile/, anyOf: ["Perfil"] } },
  // V5-4a (DEC-138): o cartão de perfil de OUTRA pessoa é onde os dados de pessoa aparecem em
  // leitura — o cartão "Meu Perfil" da própria página não os mostra. O endereço é o que o link de
  // uma pessoa no Ranking produz; o id é a conta de captura do guia (docs/.capture.env).
  { id: "perfil-de-outra-pessoa", role: "coord", route: "/dashboard/profile?userId=21", expect: { url: /\/dashboard\/profile/, anyOf: ["Dados para os documentos"] } },

  // --- participante: superficie reduzida, usada para mostrar a variação de papel ---
  { id: "quadro-tarefas-participante", role: "part", route: "/dashboard", expect: { url: /\/dashboard$/, anyOf: ["Quadro", "Tarefa"] } },
  { id: "laboratorio-participante", role: "part", route: "/dashboard/laboratorio", expect: { url: /\/dashboard\/laboratorio/, anyOf: ["Laboratório", "Plantão"] } },
  { id: "loja-participante", role: "part", route: "/dashboard/loja", expect: { url: /\/dashboard\/loja$/, anyOf: ["Loja", "Recompensa", "Ponto"] } },
  { id: "ranking-participante", role: "part", route: "/dashboard/leaderboard", expect: { url: /\/dashboard\/leaderboard/, anyOf: ["Ranking", "Pontos"] } },
  { id: "perfil-participante", role: "part", route: "/dashboard/profile", expect: { url: /\/dashboard\/profile/, anyOf: ["Perfil"] } },
];

const VIEWPORT = { width: 1440, height: 900 };

/**
 * Diálogos e abas: é onde um guia de uso realmente acontece. Cada entrada
 * abre a tela, clica no controle pelo rótulo exato que a interface mostra e
 * fotografa o resultado.
 *   abre     — texto do botão a clicar
 *   aba      — aba a selecionar antes de clicar
 *   cartao   — abrir algo dentro de um cartão nomeado da tela (container + texto + alvo)
 *   preencher — campo (ou lista de campos) a preencher antes de avançar um formulário em etapas
 *   clicar   — botões a clicar em sequência, para percorrer os passos de um formulário
 *   dialogo  — exige que um diálogo abra, e que contenha este texto
 *              (o omitido fotografa o estado após o clique: nem todo painel
 *              da aplicação é um diálogo modal)
 *   depois   — selects que só existem depois do passo anterior (V5-6: o filtro
 *              de atividade só existe com o projeto selecionado)
 */
const INTERACTIONS = [
  { id: "dashboard-projetos", role: "coord", route: "/dashboard/projetos", aba: "Dashboard", verifica: "Histórico semanal" },
  { id: "dialogo-nova-tarefa", role: "coord", route: "/dashboard", abre: "Nova Tarefa", dialogo: "Tarefa" },
  { id: "dialogo-novo-projeto", role: "coord", route: "/dashboard/projetos", abre: "Novo Projeto", dialogo: "Projeto" },
  // V5-5b (DEC-100): o passo opcional de cronograma do wizard de criação. O nome é preenchido
  // porque o primeiro passo não avança sem nome, e "Adicionar atividade" só cria a linha local —
  // nada é enviado, a captura não cria projeto. As datas encurtam a grade para caber na foto.
  { id: "dialogo-novo-projeto-cronograma", role: "coord", route: "/dashboard/projetos", abre: "Novo Projeto", preencher: [{ alvo: "#name", valor: "Projeto do guia" }, { alvo: "#startDate", valor: "2026-10-01" }, { alvo: "#endDate", valor: "2027-01-31" }], clicar: ["Avançar", "Avançar", "Adicionar atividade"], dialogo: "Cronograma" },
  { id: "laboratorio-agenda", role: "coord", route: "/dashboard/laboratorio", aba: "Agenda", abre: "Adicionar evento", dialogo: "Evento" },
  { id: "laboratorio-responsabilidade", role: "coord", route: "/dashboard/laboratorio", aba: "Responsabilidade" },
  { id: "laboratorio-reclamacoes", role: "coord", route: "/dashboard/laboratorio", aba: "Reclamações" },
  { id: "dialogo-nova-recompensa", role: "coord", route: "/dashboard/loja/gerenciar", abre: "Nova Recompensa", dialogo: "Recompensa" },
  { id: "loja-solicitacoes", role: "coord", route: "/dashboard/loja/gerenciar", aba: "Solicitações Pendentes" },
  { id: "admin-usuarios", role: "coord", route: "/dashboard/admin", aba: "Usuários" },
  { id: "admin-horas", role: "coord", route: "/dashboard/admin", aba: "Horas" },
  // O formulário de edição mora na aba Configurações. Abrir "Editar Perfil" sem abrir a aba deixa
  // o cartão em modo de edição com o formulário FORA da foto — é o que esta captura fazia até aqui
  // (o extrato media zero `label` na tela). Agora a aba abre antes do botão.
  { id: "perfil-edicao", role: "part", route: "/dashboard/profile", aba: "Configurações", abre: "Editar Perfil", verifica: "Cancelar Edição", rolarAte: "text=Dados para os documentos oficiais" },
  { id: "perfil-configuracoes", role: "part", route: "/dashboard/profile", aba: "Configurações" },
  { id: "loja-minhas-compras", role: "part", route: "/dashboard/loja", aba: "Minhas Compras" },
  { id: "controle-de-sessao", role: "part", route: "/dashboard/profile", abre: "Abrir controle de sessao" },
  { id: "relatorios-gerar-lote", role: "coord", route: "/dashboard/weekly-reports", abre: "Gerar em Lote" },
  // alvo: controle sem rótulo legível, localizado pela estrutura da tela
  { id: "dialogo-detalhe-tarefa", role: "coord", route: "/dashboard", alvo: "button.flex-1.text-left", dialogo: "PONTOS" },
  { id: "detalhe-projeto", role: "coord", route: "/dashboard/projetos", cartao: { container: ".bg-card", texto: "Pesquisa em IA", alvo: "button:has(svg.lucide-eye)" }, projetoTab: "Tarefas", verifica: "Andamento do projeto" },
  // V5-5b (DEC-126/151): a grade meses × atividades do painel Cronograma. O cartão é nomeado
  // porque a lista ordena por data de criação e três projetos da instância têm a mesma data —
  // "o primeiro cartão" não seria a mesma tela em duas execuções.
  { id: "projeto-cronograma", role: "coord", route: "/dashboard/projetos", cartao: { container: ".bg-card", texto: "Pesquisa em IA", alvo: "button:has(svg.lucide-eye)" }, projetoTab: "Tarefas", verifica: "Cronograma", rolarAte: "text=Adicionar atividade" },
  // V5-7 (DEC-76/162/165): o diálogo de conclusão da linha, os dois lados. Os dados semeados por
  // SQL (membership de gestor + linhas + prova) são apagados depois da captura — mesmo dado de
  // vida curta do V5-5b/V5-6. Abrir o diálogo só lê; nenhuma captura solicita nem aprova.
  { id: "dialogo-conclusao-atividade-pedido", role: "part", route: "/dashboard/projetos", cartao: { container: ".bg-card", texto: "Pesquisa em IA", alvo: "button:has(svg.lucide-eye)" }, projetoTab: "Tarefas", clicar: ["Conclusão da atividade 1"], dialogo: "Solicitar conclusão", rolarAte: "text=Solicitar conclusão" },
  { id: "dialogo-conclusao-atividade-aprovacao", role: "coord", route: "/dashboard/projetos", cartao: { container: ".bg-card", texto: "Pesquisa em IA", alvo: "button:has(svg.lucide-eye)" }, projetoTab: "Tarefas", clicar: ["Conclusão da atividade 2"], dialogo: "Aprovar conclusão", rolarAte: "text=Aprovar conclusão" },
  // V5-4b (DEC-149): o painel de Membros faz parte da rota dedicada do projeto.
  { id: "painel-membros", role: "coord", route: "/dashboard/projetos", cartao: { container: ".bg-card", texto: "Pesquisa em IA", alvo: "button:has(svg.lucide-eye)" }, projetoTab: "Membros", verifica: "Dados do vínculo", rolarAte: "text=Dados do vínculo" },
  // V5-9 (DEC-70/139/167/169): o painel de relatórios técnicos mora no diálogo de detalhe do
  // projeto, abaixo do cronograma. O texto semeado via SQL (os três "Pesquisa em IA") mostra o
  // editor preenchido com as três linhas de seção do oficial (DEC-168) e é apagado depois da
  // captura. Nenhuma captura salva, rascunha ou gera — o painel é fotografado em leitura.
  { id: "painel-relatorios-tecnicos", role: "coord", route: "/dashboard/projetos", cartao: { container: ".bg-card", texto: "Pesquisa em IA", alvo: "button:has(svg.lucide-eye)" }, projetoTab: "Arquivos", verifica: "Relatórios técnicos", rolarAte: "text=Relatórios técnicos" },
  // V5-10b (DEC-175): o painel de atestados mora no diálogo de detalhe, ao lado do de
  // relatórios técnicos. A captura é leitura pura: o painel lista os membros ativos do mês de
  // referência, e nenhum clique daqui gera PDF.
  { id: "painel-atestados", role: "coord", route: "/dashboard/projetos", cartao: { container: ".bg-card", texto: "Pesquisa em IA", alvo: "button:has(svg.lucide-eye)" }, projetoTab: "Arquivos", verifica: "Atestados de frequência", rolarAte: "text=Atestados de frequência" },
  { id: "painel-notificacoes", role: "coord", route: "/dashboard", abre: "/^notifica/i", dialogo: "Notifica" },
  // plan-v3 OND3-C: o menu de ordenação da coluna é o rótulo que o guia usa — sem a captura, a
  // seção "A ordem dos cartões" descreveria cinco opções que nenhuma foto do guia mostra.
  { id: "quadro-ordenar-coluna", role: "coord", route: "/dashboard", abre: "Ordenar tarefas de A Fazer", verifica: "Ordenar por" },
  // V5-6 (DEC-158): o seletor de atividade do formulário de nova tarefa. O filtro de projeto do
  // quadro pré-seleciona o projeto no diálogo (`defaultProjectId`), e o cronograma foi semeado
  // nos DOIS projetos "Pesquisa em IA" da instância — a captura é a mesma tela qualquer que seja
  // o escolhido pela lista, que ordena por data e empata nos dois.
  { id: "dialogo-nova-tarefa-atividade", role: "coord", route: "/dashboard", selecionar: { gatilho: "Todos os projetos", valor: "Pesquisa em IA" }, abre: "Nova Tarefa", rolarAte: "text=Atividade do cronograma", dialogo: "Atividade do cronograma" },
  // V5-6 (DEC-159): o filtro de atividade da barra do quadro. `depois` é o select que só existe
  // com o projeto selecionado — a lista de atividades é a do projeto, não uma lista global.
  { id: "quadro-filtro-atividade", role: "coord", route: "/dashboard", selecionar: { gatilho: "Todos os projetos", valor: "Pesquisa em IA" }, depois: [{ gatilho: "Todas as atividades", valor: "1. Coleta de dados" }], verifica: "Coleta de dados" },
];

/** A navegação é um acordeão: os destinos só aparecem quando o grupo é aberto. */
const NAVIGATION = { id: "navegacao", role: "coord", route: "/dashboard", grupos: ["Projetos", "Laboratório", "Pessoal"] };

/* ------------------------------------------------------------------ */
/* extração do que a interface realmente mostra                        */
/* ------------------------------------------------------------------ */

const EXTRACT = () => {
  const text = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();
  const some = (sel, limit) =>
    [...document.querySelectorAll(sel)].map(text).filter(Boolean).slice(0, limit);
  return {
    pageTitle: document.title,
    headings: some("h1, h2, h3", 40),
    buttons: some("button", 80),
    tabs: some('[role="tab"]', 20),
    tableHeaders: some("th", 40),
    fieldLabels: some("label", 40),
    navLinks: [...document.querySelectorAll("header a, nav a")]
      .map((a) => ({ text: text(a), href: a.getAttribute("href") }))
      .filter((l) => l.text),
  };
};

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

const env = readEnv();
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const wanted = only ? new Set(only.split(",")) : null;
const screens = SCREENS.filter((s) => !wanted || wanted.has(s.id));
const interactions = INTERACTIONS.filter((s) => !wanted || wanted.has(s.id));

if (!screens.length && !interactions.length) die("nenhuma tela selecionada (--only)");

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(MANIFEST_FILE), { recursive: true });

const browser = await chromium.launch();
const manifest = [];
const failures = [];

/** Uma sessão isolada por papel: cookies não se misturam entre papéis. */
async function openSession(kind) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  // next-themes: fixa o tema claro, que é o padrão da aplicação.
  await context.addInitScript(() => {
    localStorage.setItem("theme", "light");
    // O balão "Bem-vindo(a)!" cobre o canto esquerdo de várias telas e tapa rótulos de campo na
    // foto. Ele se dispensa por sessão de navegador; a captura dispensa antes de abrir a página.
    sessionStorage.setItem("session-welcome-balloon-dismissed", "1");
  });

  if (kind === null) return { context, page: await context.newPage() };

  const email = kind === "coord" ? env.DQ_CAPTURE_EMAIL : env.DQ_CAPTURE_EMAIL_2;
  if (!email) {
    await context.close();
    die(`sem conta de captura para o papel "${kind}" (DQ_CAPTURE_EMAIL_2 em docs/.capture.env)`);
  }

  const page = await context.newPage();
  await page.goto(`${env.DQ_CAPTURE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", env.DQ_CAPTURE_PASSWORD);
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 30_000 }).catch(() => null),
    page.press("#password", "Enter"),
  ]);
  if (!/dashboard/.test(page.url())) {
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200);
    await context.close();
    die(`login falhou para ${email}: a página permaneceu em ${page.url()} — "${body}"`);
  }
  return { context, page };
}

const sessions = new Map();

for (const screen of screens) {
  if (!sessions.has(screen.role)) sessions.set(screen.role, await openSession(screen.role));
  const { page } = sessions.get(screen.role);

  const record = { id: screen.id, role: screen.role ?? "sem sessão", route: screen.route };
  try {
    await page.goto(`${env.DQ_CAPTURE_URL}${screen.route}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(900); // animações e chunks sob demanda

    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    if (/Application error|Internal Server Error|This page could not be found/i.test(body)) {
      throw new Error(`a tela retornou erro: ${body.slice(0, 120)}`);
    }
    if (screen.expect.url && !screen.expect.url.test(page.url())) {
      throw new Error(`URL inesperada ${page.url()} (esperava ${screen.expect.url})`);
    }
    if (screen.expect.anyOf && !screen.expect.anyOf.some((t) => body.includes(t))) {
      throw new Error(`nenhum dos textos esperados apareceu: ${screen.expect.anyOf.join(" / ")}`);
    }

    record.url = page.url();
    record.dom = await page.evaluate(EXTRACT);
    if (screen.capturarElemento) {
      await page.locator(screen.capturarElemento).screenshot({ path: join(OUT_DIR, `${screen.id}.png`) });
    } else {
      await page.screenshot({ path: join(OUT_DIR, `${screen.id}.png`) });
    }

    manifest.push(record);
    log(
      `✓ ${screen.id} — ${record.dom.headings.length} títulos, ${record.dom.buttons.length} botões, ${record.dom.navLinks.length} links`
    );
  } catch (error) {
    failures.push(`${screen.id}: ${error.message}`);
    log(`✗ ${screen.id} — ${error.message}`);
  }
}

/* --- diálogos e abas --- */

/**
 * Selects que só existem depois do passo anterior (`depois`, V5-6): o filtro de atividade da
 * barra só nasce com o projeto selecionado. Mesma mecânica do `selecionar` acima — gatilho pelo
 * placeholder, opção pelo nome — só que roda depois de abrir/acionar, não antes.
 */
async function runSelects(page, selects) {
  for (const sel of [].concat(selects ?? [])) {
    await page.getByText(sel.gatilho, { exact: true }).first().click();
    await page.waitForTimeout(600);
    if (sel.valor) {
      await page.getByRole("option", { name: sel.valor, exact: true }).first().click();
    } else {
      await page.getByRole("option").first().click();
    }
    await page.waitForTimeout(900);
  }
}

for (const it of interactions) {
  if (!sessions.has(it.role)) sessions.set(it.role, await openSession(it.role));
  const { page } = sessions.get(it.role);

  const record = { id: it.id, role: it.role === "coord" ? "coordenador" : "participante", route: it.route };
  try {
    await page.goto(`${env.DQ_CAPTURE_URL}${it.route}`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(800);

    if (it.aba) {
      await page.getByRole("tab", { name: it.aba, exact: true }).first().click();
      await page.waitForTimeout(800);
      record.aba = it.aba;

      // Verificação também para captura de aba. Sem isso, uma aba que mudou de conteúdo é
      // fotografada em silêncio — foi assim que o guia continuou descrevendo um filtro de status
      // que o DEC-96 já tinha tirado da tela. Quando a captura também abre algo, a verificação é
      // do que existe DEPOIS do clique, e fica no ramo de baixo.
      if (it.verifica && !it.abre && !it.alvo) {
        const tabText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        if (!tabText.includes(it.verifica)) {
          throw new Error(`a aba "${it.aba}" não contém "${it.verifica}": "${tabText.slice(0, 140)}"`);
        }
      }
    }

    // Escolher uma opção de Select antes de agir: o painel de Membros só aparece depois de
    // selecionar o projeto, e o `SelectTrigger` com só `<SelectValue placeholder=…>` não tem nome
    // acessível (medido no V5-4a) — o placeholder é o que a tela mostra, então é por ele que o
    // passo procura. Sem `valor`, escolhe a primeira opção.
    if (it.selecionar) {
      await page.getByText(it.selecionar.gatilho, { exact: true }).first().click();
      await page.waitForTimeout(600);
      if (it.selecionar.valor) {
        await page.getByRole("option", { name: it.selecionar.valor, exact: true }).first().click();
      } else {
        await page.getByRole("option").first().click();
      }
      await page.waitForTimeout(900);
    }

    if (it.abre || it.alvo || it.cartao || it.rolarAteFim) {
      if (it.abre) {
        // Primitiva (V5-8): "/texto/flags" no `abre` vira expressão regular. O rótulo do sino
        // muda com a contagem de não-lidas ("Notificações (1 não lidas)"), e o exact só
        // batia com o painel vazio — que era o estado da captura antiga.
        const rx = /^\/(.+)\/([a-z]*)$/.exec(it.abre);
        const name = rx ? new RegExp(rx[1], rx[2]) : it.abre;
        await page.getByRole("button", { name }).first().click();
      } else if (it.cartao) {
        // Cartão nomeado: a lista de projetos ordena por data de criação desc, e três projetos da
        // instância têm a MESMA data — "o primeiro cartão" não é determinístico. A captura que
        // precisa de conteúdo no diálogo diz qual projeto abre.
        const card = page.locator(it.cartao.container).filter({ hasText: it.cartao.texto }).first();
        await card.locator(it.cartao.alvo).first().click();
      } else await page.locator(it.alvo).first().click();
      await page.waitForTimeout(900);

      if (it.projetoTab) {
        await page.waitForURL(/\/dashboard\/projetos\/\d+/, { timeout: 15_000 });
        await page.getByRole("tab", { name: it.projetoTab, exact: true }).click();
        await page.waitForTimeout(700);
      }

      // Formulário em etapas (o wizard do projeto, DEC-100): `preencher` existe porque o primeiro
      // passo não avança sem nome, e `clicar` percorre os passos. Nada é enviado: nenhuma captura
      // nova escreve na instância.
      for (const campo of [].concat(it.preencher ?? [])) {
        await page.fill(campo.alvo, campo.valor);
        await page.waitForTimeout(300);
      }
      for (const clique of it.clicar ?? []) {
        await page.getByRole("button", { name: clique, exact: true }).first().click();
        await page.waitForTimeout(500);
      }

      await runSelects(page, it.depois);

      if (it.dialogo) {
        await page.waitForSelector('[role="dialog"]', { timeout: 12_000 });
        await page.waitForTimeout(700);
        // Diálogo aninhado (V5-7): o de conclusão abre DENTRO do de detalhe do projeto, e cada
        // Radix Dialog é um portal próprio no body. Ler só o primeiro leria o diálogo de fora e
        // não veria o controle aberto. A verificação percorre todos, de fora para dentro.
        const dialogText = (await page.locator('[role="dialog"]').allInnerTexts())
          .join(" ")
          .replace(/\s+/g, " ");
        if (!dialogText.includes(it.dialogo)) {
          throw new Error(`o diálogo aberto não contém "${it.dialogo}": "${dialogText.slice(0, 120)}"`);
        }
        record.dialog = dialogText.slice(-400);
      } else {
        const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        if (it.verifica && !bodyText.includes(it.verifica)) {
          throw new Error(`após o clique a tela não contém "${it.verifica}": "${bodyText.slice(0, 140)}"`);
        }
        record.after = bodyText.slice(0, 300);
      }
    } else if (it.depois) {
      // Captura sem "abrir" nada: o quadro já está na tela, e o passo é só a sequência de
      // selects da barra (projeto → atividade). A verificação é do texto que o último select
      // mostra escolhido.
      await runSelects(page, it.depois);
      const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      if (it.verifica && !bodyText.includes(it.verifica)) {
        throw new Error(`após a seleção a tela não contém "${it.verifica}": "${bodyText.slice(0, 140)}"`);
      }
      record.after = bodyText.slice(0, 300);
    }

    record.url = page.url();
    // Algumas telas têm o bloco que importa longe do topo (o formulário do perfil começa pelo
    // recorte de foto; o diálogo de gestão começa pelas estatísticas de hora). `rolarAte` leva o
    // bloco ao campo de visão antes da foto — sem ele a captura fotografa a tela errada da tela certa.
    if (it.rolarAte) {
      await page.locator(it.rolarAte).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      record.roladoPara = it.rolarAte;
    }
    if (it.rolarAteFim) {
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.waitForTimeout(500);
    }
    record.dom = await page.evaluate(EXTRACT);
    if (it.capturarElemento) {
      await page.locator(it.capturarElemento).screenshot({ path: join(OUT_DIR, `${it.id}.png`) });
    } else {
      await page.screenshot({ path: join(OUT_DIR, `${it.id}.png`) });
    }

    manifest.push(record);
    log(`✓ ${it.id} — ${record.dialog ? "diálogo" : "aba"} capturado`);
  } catch (error) {
    failures.push(`${it.id}: ${error.message}`);
    log(`✗ ${it.id} — ${error.message}`);
  }
}

/* --- navegação: um registro por grupo, com o grupo aberto --- */
if (!wanted) {
  const { page } = sessions.get(NAVIGATION.role) ?? (await openSession(NAVIGATION.role));
  for (const grupo of NAVIGATION.grupos) {
    const id = `navegacao-${grupo.toLowerCase().replace(/[^a-z]/g, "")}`;
    try {
      await page.goto(`${env.DQ_CAPTURE_URL}${NAVIGATION.route}`, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: grupo, exact: true }).first().click();
      await page.waitForTimeout(700);

      const record = { id, role: "coordenador", route: NAVIGATION.route, grupo };
      record.dom = await page.evaluate(EXTRACT);
      await page.locator("header").first().screenshot({ path: join(OUT_DIR, `${id}.png`) });
      manifest.push(record);
      log(`✓ ${id} — destinos visíveis: ${record.dom.navLinks.map((l) => l.text).join(", ")}`);
    } catch (error) {
      failures.push(`${id}: ${error.message}`);
      log(`✗ ${id} — ${error.message}`);
    }
  }
}

await browser.close();

/* ------------------------------------------------------------------ */
/* normalização                                                        */
/* ------------------------------------------------------------------ */

/**
 * As capturas saem supersampled (2x = 2880px). O documento exibe a tela em
 * ~800px, então 1440 de largura já é o dobro do necessário — e corta o peso
 * do HTML embutido a menos da metade. `sips` existe no macOS; onde não existe,
 * as capturas ficam em 2x e o documento sai maior (nada quebra).
 */
function normalizeScreens(ids) {
  try {
    execFileSync("sips", ["--version"], { stdio: "ignore" });
  } catch {
    log("AVISO: sips indisponível — capturas mantidas em 2880px");
    return;
  }
  for (const id of ids) {
    execFileSync("sips", ["-Z", "1440", join(OUT_DIR, `${id}.png`)], { stdio: "ignore" });
  }
  log(`${ids.length} captura(s) normalizada(s) para 1440px de largura`);
}

normalizeScreens(manifest.map((r) => r.id));

// Uma execução parcial (--only) atualiza o que foi capturado e preserva o resto.
const previous = existsSync(MANIFEST_FILE) ? JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) : [];
const byId = new Map(previous.map((r) => [r.id, r]));
for (const r of manifest) byId.set(r.id, r);
const merged = [...byId.values()];
writeFileSync(MANIFEST_FILE, JSON.stringify(merged, null, 2));
log(`${manifest.length} tela(s) nesta execução, ${merged.length} no extrato → ${OUT_DIR}`);

if (failures.length) {
  console.error(`\n[captura] ${failures.length} tela(s) falharam:\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
