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
  { id: "projetos", role: "coord", route: "/dashboard/projetos", expect: { url: /\/dashboard\/projetos/, anyOf: ["Projeto"] } },
  { id: "laboratorio", role: "coord", route: "/dashboard/laboratorio", expect: { url: /\/dashboard\/laboratorio/, anyOf: ["Laboratório", "Plantão"] } },
  { id: "relatorios-semanais", role: "coord", route: "/dashboard/weekly-reports", expect: { url: /\/dashboard\/weekly-reports/, anyOf: ["Relatório"] } },
  { id: "painel-administrativo", role: "coord", route: "/dashboard/admin", expect: { url: /\/dashboard\/admin/, anyOf: ["Administrativo", "Usuário"] } },
  { id: "loja-gerenciar", role: "coord", route: "/dashboard/loja/gerenciar", expect: { url: /\/dashboard\/loja\/gerenciar/, anyOf: ["Loja", "Recompensa", "Compra"] } },
  { id: "perfil", role: "coord", route: "/dashboard/profile", expect: { url: /\/dashboard\/profile/, anyOf: ["Perfil"] } },

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
 *   dialogo  — exige que um diálogo abra, e que contenha este texto
 *              (o omitido fotografa o estado após o clique: nem todo painel
 *              da aplicação é um diálogo modal)
 */
const INTERACTIONS = [
  { id: "dialogo-nova-tarefa", role: "coord", route: "/dashboard", abre: "Nova Tarefa", dialogo: "Tarefa" },
  { id: "dialogo-novo-projeto", role: "coord", route: "/dashboard/projetos", abre: "Novo Projeto", dialogo: "Projeto" },
  { id: "laboratorio-agenda", role: "coord", route: "/dashboard/laboratorio", aba: "Agenda", abre: "Adicionar evento", dialogo: "Evento" },
  { id: "laboratorio-responsabilidade", role: "coord", route: "/dashboard/laboratorio", aba: "Responsabilidade" },
  { id: "laboratorio-reclamacoes", role: "coord", route: "/dashboard/laboratorio", aba: "Reclamações" },
  { id: "dialogo-nova-recompensa", role: "coord", route: "/dashboard/loja/gerenciar", abre: "Nova Recompensa", dialogo: "Recompensa" },
  { id: "loja-solicitacoes", role: "coord", route: "/dashboard/loja/gerenciar", aba: "Solicitações Pendentes" },
  { id: "admin-usuarios", role: "coord", route: "/dashboard/admin", aba: "Usuários" },
  { id: "admin-horas", role: "coord", route: "/dashboard/admin", aba: "Horas" },
  { id: "perfil-edicao", role: "part", route: "/dashboard/profile", abre: "Editar Perfil", verifica: "Cancelar Edição" },
  { id: "perfil-configuracoes", role: "part", route: "/dashboard/profile", aba: "Configurações" },
  { id: "loja-minhas-compras", role: "part", route: "/dashboard/loja", aba: "Minhas Compras" },
  { id: "controle-de-sessao", role: "part", route: "/dashboard/profile", abre: "Abrir controle de sessao" },
  { id: "relatorios-gerar-lote", role: "coord", route: "/dashboard/weekly-reports", abre: "Gerar em Lote" },
  // alvo: controle sem rótulo legível, localizado pela estrutura da tela
  { id: "dialogo-detalhe-tarefa", role: "coord", route: "/dashboard", alvo: "button.flex-1.text-left", dialogo: "PONTOS" },
  { id: "dialogo-detalhe-projeto", role: "coord", route: "/dashboard/projetos", alvo: "button:has(svg.lucide-eye)", dialogo: "Progresso Geral" },
  { id: "painel-notificacoes", role: "coord", route: "/dashboard", abre: "Notificações", dialogo: "Notifica" },
  // plan-v3 OND3-C: o menu de ordenação da coluna é o rótulo que o guia usa — sem a captura, a
  // seção "A ordem dos cartões" descreveria cinco opções que nenhuma foto do guia mostra.
  { id: "quadro-ordenar-coluna", role: "coord", route: "/dashboard", abre: "Ordenar tarefas de A Fazer", verifica: "Ordenar por" },
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
  await context.addInitScript(() => localStorage.setItem("theme", "light"));

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
    await page.screenshot({ path: join(OUT_DIR, `${screen.id}.png`) });

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
    }

    if (it.abre || it.alvo) {
      if (it.abre) await page.getByRole("button", { name: it.abre, exact: true }).first().click();
      else await page.locator(it.alvo).first().click();
      await page.waitForTimeout(900);

      if (it.dialogo) {
        await page.waitForSelector('[role="dialog"]', { timeout: 12_000 });
        await page.waitForTimeout(700);
        const dialogText = (await page.locator('[role="dialog"]').first().innerText()).replace(/\s+/g, " ");
        if (!dialogText.includes(it.dialogo)) {
          throw new Error(`o diálogo aberto não contém "${it.dialogo}": "${dialogText.slice(0, 120)}"`);
        }
        record.dialog = dialogText.slice(0, 400);
      } else {
        const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        if (it.verifica && !bodyText.includes(it.verifica)) {
          throw new Error(`após o clique a tela não contém "${it.verifica}": "${bodyText.slice(0, 140)}"`);
        }
        record.after = bodyText.slice(0, 300);
      }
    }

    record.url = page.url();
    record.dom = await page.evaluate(EXTRACT);
    await page.screenshot({ path: join(OUT_DIR, `${it.id}.png`) });

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
