#!/usr/bin/env node
/**
 * Monta os documentos de documentação do DisplayQuest a partir de:
 *   docs/src/*.md           — texto do documento técnico
 *   docs/src-usuario/*.md   — texto do guia do usuário
 *   docs/diagrams/*.puml    — diagramas (PlantUML)
 *   docs/.build/screens/    — capturas de tela (produzidas pela captura)
 *   docs/theme/document.css — folha de estilo, comum aos dois
 *
 * Saída: docs/displayquest.html e docs/guia-do-usuario.html, cada um um
 * arquivo único e autocontido — diagramas e capturas vão embutidos dentro.
 *
 * Etapas:
 *   1. render   .puml → SVG (PlantUML em contêiner; erro de sintaxe derruba o build)
 *   2. post     normaliza o SVG (viewBox responsivo, sem dimensões fixas)
 *   3. check    blocos cercados fechados, mídias existentes, títulos únicos
 *   4. parse    Markdown → HTML; ```figure``` embute o SVG, ```foto``` embute o PNG
 *   5. assemble capa, sumário automático, lista de figuras, CSS inline
 *
 * Uso:
 *   node scripts/build-docs.mjs                renderiza diagramas + monta os dois
 *   node scripts/build-docs.mjs --no-render     reaproveita os SVGs já gerados
 *   node scripts/build-docs.mjs --only=usuario  monta só um documento
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const PUML_DIR = join(DOCS, "diagrams");
const THEME = join(DOCS, "theme", "document.css");
const SVG_DIR = join(DOCS, ".build", "svg");

const PLANTUML_IMAGE = process.env.PLANTUML_IMAGE || "plantuml/plantuml:latest";
const skipRender = process.argv.includes("--no-render");

const log = (...a) => console.log("[docs]", ...a);
const die = (msg) => {
  console.error(`\n[docs] ERRO: ${msg}\n`);
  process.exit(1);
};

/* ================================================================== */
/* 1 · render dos diagramas                                            */
/* ================================================================== */

const pumlFiles = existsSync(PUML_DIR)
  ? readdirSync(PUML_DIR)
      .filter((f) => f.endsWith(".puml") && !f.startsWith("_")) // _base.puml é include, não diagrama
      .sort()
  : [];

function renderDiagrams() {
  if (!pumlFiles.length) {
    log("nenhum .puml em docs/diagrams — seguindo sem diagramas");
    return;
  }
  mkdirSync(SVG_DIR, { recursive: true });
  log(`renderizando ${pumlFiles.length} diagrama(s)…`);
  try {
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${PUML_DIR}:/in:ro`,
        "-v",
        `${SVG_DIR}:/out`,
        "-w",
        "/in",
        PLANTUML_IMAGE,
        "-tsvg",
        "-charset",
        "UTF-8",
        "-o",
        "/out",
        ...pumlFiles,
      ],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
  } catch {
    die("falha ao executar o contêiner do PlantUML (Docker em execução?).");
  }
}

/* ================================================================== */
/* 2 · pós-processamento dos SVG                                       */
/* ================================================================== */

/**
 * O PlantUML emite `<svg width="392px" height="223px" style="…">`, com tamanho
 * travado. Para o diagrama fluir no meio do texto, mantemos só o viewBox e
 * deixamos a largura ser 100%.
 */
function normalizeSvg(raw, id) {
  const fail =
    /syntax error/i.test(raw) ||
    /cannot be parsed/i.test(raw) ||
    /Some diagram description contains errors/i.test(raw) ||
    /Error line \d+/i.test(raw);
  if (fail) {
    const msg =
      raw.match(/<text[^>]*>([^<]{0,300})/) ||
      raw.match(/Error line \d+ in file: [\w.-]+/) ||
      null;
    die(`${id}.puml — ${msg ? msg[1] : "erro de sintaxe; veja a saída do PlantUML"}`);
  }
  const tag = raw.match(/<svg\b[^>]*>/);
  if (!tag) die(`${id}.svg — elemento <svg> não encontrado`);
  const vb = tag[0].match(/viewBox="([^"]+)"/);
  if (!vb) die(`${id}.svg — viewBox ausente`);

  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="${vb[1]}" width="100%" preserveAspectRatio="xMidYMin meet" ` +
    `class="dq-diagram" role="img" aria-label="${escapeAttr(id)}">`;

  // O PlantUML numera os elementos de cada diagrama de forma independente
  // (ent0001, lnk34…), o que colide entre os 33 diagramas dentro de um único
  // documento. O prefixo dá a cada diagrama o seu próprio espaço de âncoras.
  const ns = escapeAttr(id) + "-";
  const scoped = raw
    .replace(tag[0], open)
    .replace(/\bid="([^"]*)"/g, (_m, v) => `id="${ns}${v}"`)
    .replace(/\b(xlink:href|href)="#([^"]*)"/g, (_m, a, v) => `${a}="#${ns}${v}"`)
    .replace(/url\(#([^)]*)\)/g, (_m, v) => `url(#${ns}${v})`);

  return scoped.replace(/<\?plantuml[^?]*\?>/g, "");
}

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const stripTags = (s) => s.replace(/<[^>]+>/g, "");

const svgCache = new Map();

function loadSvg(id) {
  if (svgCache.has(id)) return svgCache.get(id);
  const path = join(SVG_DIR, `${id}.svg`);
  if (!existsSync(path)) die(`diagrama "${id}" sem SVG em ${SVG_DIR} — rode o build sem --no-render`);
  const out = normalizeSvg(readFileSync(path, "utf8"), id);
  svgCache.set(id, out);
  return out;
}

/* ================================================================== */
/* 3 · validação das fontes                                            */
/* ================================================================== */

/**
 * Varre um arquivo Markdown e falha se algum bloco cercado ficar sem
 * fechamento. Sem esta checagem, um ```figure sem o ``` final não dá erro:
 * o Markdown absorve o texto seguinte como legenda da figura, e o capítulo
 * inteiro aparece aninhado dentro dela, sem que nada denuncie o problema.
 */
function checkFences(file, src) {
  const lines = src.split("\n");
  const FENCE = /^ {0,3}(`{3,})[ \t]*(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]);
    if (!open) continue;

    const marker = open[1];
    let closed = false;
    for (let j = i + 1; j < lines.length; j++) {
      const close = FENCE.exec(lines[j]);
      if (!close) continue;
      if (close[1].length >= marker.length && close[2].trim() === "") {
        closed = true;
        i = j;
        break;
      }
    }

    if (!closed) {
      die(`${file}:${i + 1} — bloco cercado sem fechamento: \`${open[2].trim() || "(sem título)"}\``);
    }
  }
}

/* ================================================================== */
/* 4 · Markdown → HTML                                                 */
/* ================================================================== */

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

/**
 * ::: nota | atencao | limite | legado  [titulo="…"]
 * …markdown…
 * :::
 *
 * Convertido num fence antes da renderização: mais simples e menos frágil
 * que um block rule do markdown-it.
 */
function expandCallouts(src) {
  return src.replace(
    /^:::\s*(nota|atencao|limite|legado)(?:\s+titulo="([^"]*)")?\s*\n([\s\S]*?)^:::\s*$/gim,
    (_all, kind, titulo, body) =>
      "```callout-" + kind + (titulo ? ` titulo="${titulo}"` : "") + "\n" + body + "\n```"
  );
}

/** ```figure <id> [titulo="…"]``` */
function expandFigures(src) {
  return src.replace(/^```figure\s+(\S+)/gm, (_all, id) => "```figure " + id);
}

md.renderer.rules.callout = (tokens, idx) => {
  const t = tokens[idx];
  const m = /callout-(\w+)(?:\s+titulo="([^"]*)")?/.exec(t.info.trim());
  if (!m) return `<pre><code>${md.utils.escapeHtml(t.content)}</code></pre>`;
  const kind = m[1];
  const label = m[2] || { nota: "Nota", atencao: "Atenção", limite: "Limite", legado: "Comportamento legado" }[kind];
  return (
    `<aside class="dq-callout dq-callout--${kind}">` +
    `<p class="dq-callout__label">${label}</p>` +
    `<div class="dq-callout__body">${md.render(t.content)}</div>` +
    `</aside>`
  );
};

md.renderer.rules.figure = (tokens, idx) => {
  const t = tokens[idx];
  const m = /^figure\s+(\S+)(?:\s+titulo="([^"]*)")?/.exec(t.info.trim());
  if (!m) return `<pre><code>${md.utils.escapeHtml(t.content)}</code></pre>`;
  const [, id, titulo] = m;
  const caption = titulo || id;
  if (seenFigureIds.has(id)) die(`diagrama "${id}" referenciado mais de uma vez`);
  seenFigureIds.add(id);
  const legend = md.render(t.content).trim();
  figures.push({ id, caption });
  return (
    `<figure class="dq-figure" id="fig-${id}">` +
    `<div class="dq-figure__plot">${loadSvg(id)}</div>` +
    `<figcaption><span class="dq-figure__num">Figura ${figures.length}</span>` +
    `<span class="dq-figure__cap">${md.renderInline(caption)}</span></figcaption>` +
    (legend ? `<div class="dq-figure__legend">${legend}</div>` : "") +
    `</figure>`
  );
};

// ```figure``` e ```callout-*``` são mapeados para o fence padrão
const fenceDefault = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
  const info = tokens[idx].info.trim();
  if (/^figure\s/.test(info)) return md.renderer.rules.figure(tokens, idx, opts, env, self);
  if (/^foto\s/.test(info)) return md.renderer.rules.foto(tokens, idx, opts, env, self);
  if (/^callout-/.test(info)) return md.renderer.rules.callout(tokens, idx, opts, env, self);
  return fenceDefault(tokens, idx, opts, env, self);
};

/** ```foto <id> [titulo="…"]``` — captura de tela, embutida como data URI. */
md.renderer.rules.foto = (tokens, idx) => {
  const t = tokens[idx];
  const m = /^foto\s+(\S+)(?:\s+titulo="([^"]*)")?/.exec(t.info.trim());
  if (!m) return `<pre><code>${md.utils.escapeHtml(t.content)}</code></pre>`;
  const [, id, titulo] = m;
  if (seenFigureIds.has(id)) die(`captura "${id}" referenciada mais de uma vez`);
  seenFigureIds.add(id);
  const caption = titulo || id;
  const legend = md.render(t.content).trim();
  figures.push({ id, caption });
  return (
    `<figure class="dq-figure dq-figure--photo" id="fig-${id}">` +
    `<div class="dq-figure__plot">${loadPhoto(id)}</div>` +
    `<figcaption><span class="dq-figure__num">Figura ${figures.length}</span>` +
    `<span class="dq-figure__cap">${md.renderInline(caption)}</span></figcaption>` +
    (legend ? `<div class="dq-figure__legend">${legend}</div>` : "") +
    `</figure>`
  );
};

// âncora nos h1/h2/h3, usada pelo sumário e pelo scroll-spy
const headingOpen = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = (tokens, idx, opts, env, self) => {
  const level = Number(tokens[idx].tag.slice(1));
  if (level >= 1 && level <= 3) {
    const text = tokens[idx + 1].children.map((c) => c.content).join("");
    const base = slugify(text);
    if (base) {
      // Títulos repetidos são legítimos entre irmãos (vários casos de uso têm
      // "Identificação"); a âncora recebe sufixo para não colidir. Duas
      // seções de nível 1 com o mesmo título, não: seria capítulo duplicado.
      let id = base;
      for (let n = 2; seenAnchorIds.has(id); n++) id = `${base}-${n}`;
      if (level === 1 && id !== base) die(`duas seções com o mesmo título: "${text}"`);
      seenAnchorIds.add(id);
      tokens[idx].attrSet("id", id);
    }
  }
  return headingOpen ? headingOpen(tokens, idx, opts, env, self) : self.renderToken(tokens, idx, opts);
};

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

/* ================================================================== */
/* 5 · montagem                                                        */
/* ================================================================== */

const SCREEN_DIR = join(DOCS, ".build", "screens");

const figures = [];
const seenFigureIds = new Set();
const seenAnchorIds = new Set();

function resetDocumentState() {
  figures.length = 0;
  seenFigureIds.clear();
  seenAnchorIds.clear();
}

/**
 * Capturas de tela viram data URI: o documento continua sendo um arquivo
 * único, sem dependência de pasta de imagens ao lado.
 */
const photoCache = new Map();

function loadPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const path = join(SCREEN_DIR, `${id}.png`);
  if (!existsSync(path)) {
    die(`captura "${id}" sem PNG em docs/.build/screens — rode primeiro a captura de telas`);
  }
  const tag = `<img class="dq-photo" src="data:image/png;base64,${readFileSync(path).toString("base64")}" alt="${escapeAttr(id)}">`;
  photoCache.set(id, tag);
  return tag;
}

function parseSources(def) {
  const files = existsSync(def.src)
    ? readdirSync(def.src).filter((f) => f.endsWith(".md")).sort()
    : [];

  if (!files.length) die(`nenhum .md em ${def.src.replace(ROOT + "/", "")}`);

  // valida os blocos cercados e pré-carrega as mídias, para falhar cedo
  for (const f of files) {
    const raw = readFileSync(join(def.src, f), "utf8");
    checkFences(f, raw);
    for (const m of raw.matchAll(/^```figure\s+(\S+)/gm)) loadSvg(m[1]);
    for (const m of raw.matchAll(/^```foto\s+(\S+)/gm)) loadPhoto(m[1]);
  }

  const body = files
    .map((f) => {
      const src = readFileSync(join(def.src, f), "utf8");
      const html = md.render(expandCallouts(expandFigures(src)));
      return `<section class="dq-section">\n${html}\n</section>`;
    })
    .join("\n");

  if (def.diagrams) {
    const used = new Set(figures.map((f) => f.id));
    for (const id of svgCache.keys()) {
      if (!used.has(id)) log(`AVISO: docs/diagrams/${id}.puml não é usado por nenhum src/*.md`);
    }
    for (const f of pumlFiles) {
      if (!existsSync(join(SVG_DIR, `${basename(f, ".puml")}.svg`))) log(`AVISO: ${f} não produziu SVG`);
    }
  }

  return { body, count: files.length };
}


/** Sumário em árvore a partir dos h1/h2/h3 do corpo já renderizado. */
function extractToc(doc) {
  const re = /<h([123]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  const items = [];
  let m;
  while ((m = re.exec(doc))) items.push({ level: +m[1], id: m[2], text: stripTags(m[3]) });
  if (!items.length) return "";

  const root = { children: [] };
  const stack = [{ level: 0, node: root }];
  for (const it of items) {
    while (stack[stack.length - 1].level >= it.level) stack.pop();
    const node = { id: it.id, text: it.text, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level: it.level, node });
  }

  const render = (nodes) =>
    "<ul>" +
    nodes
      .map(
        (n) =>
          `<li><a href="#${n.id}">${n.text}</a>${n.children.length ? render(n.children) : ""}</li>`
      )
      .join("") +
    "</ul>";
  return render(root.children);
}

function gitStamp() {
  try {
    return execFileSync("git", ["log", "-1", "--format=%h (%cs)"], { cwd: ROOT }).toString().trim();
  } catch {
    return "HEAD";
  }
}

/* ------------------------------------------------------------------ */
/* os documentos                                                       */
/* ------------------------------------------------------------------ */

const DOCUMENTS = [
  {
    key: "tecnico",
    src: join(DOCS, "src"),
    out: join(DOCS, "displayquest.html"),
    title: "DisplayQuest — Documentação técnica e de análise do sistema",
    description:
      "Documentação do DisplayQuest: visão geral, requisitos, casos de uso, regras de negócio, máquinas de estado, modelo conceitual e arquitetura do sistema.",
    eyebrow: "Laboratório de Jogos e Novas Tecnologias Display",
    subtitle: "Documentação técnica e de análise do sistema",
    lede:
      "Sistema de apoio à operação do laboratório: registro de trabalho, projetos, tarefas, carga horária e mecânicas de engajamento. Este documento descreve o que o sistema faz, por que o faz, e como está organizado por dentro.",
    facts: [
      ["Natureza", "Aplicação web monolítica modular"],
      ["Persistência", "PostgreSQL 15 · Prisma 6"],
      ["Superfície HTTP", "77 rotas em <code>app/api</code>"],
      ["Módulos de domínio", "11 módulos no backend"],
    ],
    diagrams: true,
    sources: "<code>docs/src/</code> e <code>docs/diagrams/</code>. Diagramas em notação UML (PlantUML)",
    listTitle: "Lista de figuras",
  },
  {
    key: "usuario",
    src: join(DOCS, "src-usuario"),
    out: join(DOCS, "guia-do-usuario.html"),
    title: "DisplayQuest — Guia do usuário",
    description:
      "Guia de uso do DisplayQuest: criar conta, registrar trabalho, mover e revisar tarefas, consultar relatórios, operar o laboratório, resgatar recompensas e administrar contas.",
    eyebrow: "Laboratório de Jogos e Novas Tecnologias Display",
    subtitle: "Guia do usuário",
    lede:
      "Como fazer cada coisa no DisplayQuest, tela por tela. Cada procedimento parte do que aparece na interface e termina no resultado que o sistema produz. O que o sistema é por dentro está descrito no documento técnico.",
    facts: [
      ["Para quem", "Participantes, laboratoristas e coordenadores"],
      ["Telas", "As dez telas, com as variações por papel"],
      ["Formato", "Procedimentos, referência de telas e mensagens"],
      ["Capturas", "Obtidas na instância em execução"],
    ],
    diagrams: false,
    sources: "<code>docs/src-usuario/</code> e as capturas de tela de <code>docs/.build/screens/</code>",
    listTitle: "Lista de telas",
  },
];

const SCRIPT = `
<script>
(function () {
  var nav = document.querySelector('.dq-toc');
  var links = [].slice.call(nav.querySelectorAll('a'));
  var targets = links
    .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
    .filter(Boolean);

  function sync() {
    var best = null, bestTop = -Infinity;
    for (var i = 0; i < targets.length; i++) {
      var top = targets[i].getBoundingClientRect().top - 120;
      if (top <= 0 && top > bestTop) { bestTop = top; best = targets[i]; }
    }
    links.forEach(function (a) { a.classList.remove('is-current'); });
    if (!best) return;
    var link = nav.querySelector('a[href="#' + best.id + '"]');
    if (!link) return;
    link.classList.add('is-current');
    var top = link.offsetTop;
    if (top < nav.scrollTop || top > nav.scrollTop + nav.clientHeight - 80) {
      nav.scrollTop = top - nav.clientHeight / 2;
    }
  }

  var queued = false;
  addEventListener('scroll', function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; sync(); });
  }, { passive: true });

  sync();
})();
</script>
`;

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

if (!skipRender) renderDiagrams();
else log("--no-render: reaproveitando docs/.build/svg");

const onlyKey = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const css = readFileSync(THEME, "utf8");
let built = 0;

for (const def of DOCUMENTS) {
  if (onlyKey && def.key !== onlyKey) continue;
  if (!existsSync(def.src)) {
    log(`pulando "${def.key}": ${def.src.replace(ROOT + "/", "")} não existe`);
    continue;
  }

  resetDocumentState();

  const { body, count } = parseSources(def);
  const toc = extractToc(body);
  const list = figures
    .map((f, i) => `<li><a href="#fig-${f.id}">Figura ${i + 1} — ${stripTags(f.caption)}</a></li>`)
    .join("\n");
  const facts = def.facts.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join("\n    ");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${def.title}</title>
<meta name="description" content="${def.description}">
<style>
${css}
</style>
</head>
<body>
<a class="dq-skip" href="#conteudo">Ir para o conteúdo</a>

<header class="dq-cover">
  <p class="dq-cover__eyebrow">${def.eyebrow}</p>
  <h1 class="dq-cover__title">DisplayQuest</h1>
  <p class="dq-cover__subtitle">${def.subtitle}</p>
  <p class="dq-cover__lede">
    ${def.lede}
  </p>
  <dl class="dq-cover__facts">
    ${facts}
  </dl>
</header>

<div class="dq-shell">
  <nav class="dq-toc" aria-label="Sumário">
    <p class="dq-toc__title">Sumário</p>
    ${toc}
  </nav>

  <main class="dq-main" id="conteudo">
    ${body}

    <section class="dq-section">
      <h2 id="lista-de-figuras">${def.listTitle}</h2>
      <ol class="dq-lof">
${list}
      </ol>
    </section>
  </main>
</div>

<footer class="dq-footer">
  <p>
    Conteúdo gerado a partir de ${def.sources}. O conteúdo reflete o estado do
    código no commit <code>${gitStamp()}</code>.
  </p>
</footer>
${SCRIPT}
</body>
</html>
`;

  writeFileSync(def.out, html);
  built++;
  log(
    `ok [${def.key}] — ${count} seções, ${figures.length} figuras → ${def.out.replace(ROOT + "/", "")} (${(statSync(def.out).size / 1024) | 0} KB)`
  );
}

if (!built) die("nenhum documento construído");
