#!/usr/bin/env node
/**
 * plan-v16 S05 (R7, INV5) — as 50 imagens do catálogo de badges.
 *
 * Fonte: Lucide (ISC), um SVG por token, renderizado a 128×128 WebP na cor do próprio badge.
 * A manifest (`assets/badge-icons/manifest.json`) é a fonte do pareamento slug → token → cor
 * → arquivo, e a guarda `tests/unit/scripts/badge-icons-manifest.test.ts` a congela contra o
 * catálogo SQL. Os renomes medidos na fonte Lucide (check-circle→circle-check, play→circle-play,
 * bar-chart→chart-column, alert-triangle→triangle-alert, check-square→square-check,
 * plus-circle→circle-plus) valem aqui como valiam no catálogo.
 *
 * Modos:
 *   --check   valida manifest + catálogo + arquivos, sem tocar banco nem bucket (aceite da fatia);
 *   --render  desenha os 50 WebP a partir dos SVG na cor do badge;
 *   apply     sobe cada WebP ao bucket com chave determinística `badges/<id>/icon.webp` e escreve
 *             `iconKey` na linha do slug. Pula badge que já tem chave — re-run não duplica objeto.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
// Prisma, S3 e sharp entram por import dinâmico: `node scripts/apply-badge-icons.mjs --check`
// roda sem tocar banco, bucket nem imagem, e as importações estáticas desses três não
// resolvem em node puro (a seam S3 é TypeScript).

const ASSET_ROOT = "assets/badge-icons";

const RENAME = {
  "check-circle": "circle-check",
  play: "circle-play",
  "bar-chart": "chart-column",
  "alert-triangle": "triangle-alert",
  "check-square": "square-check",
  "plus-circle": "circle-plus",
};

function catalogRows() {
  const sql = readFileSync("prisma/cataloga-badges.sql", "utf8");
  const rows = [];
  for (const line of sql.split("\n")) {
    if (!line.startsWith("INSERT")) continue;
    const head = line.match(/SELECT '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)'/);
    const slug = line.match(/::jsonb, '([^']*)'/);
    if (!head || !slug) throw new Error(`linha de catálogo sem pareamento reconhecível: ${line.slice(0, 80)}`);
    rows.push({ slug: slug[1], token: RENAME[head[3]] ?? head[3], color: head[4] });
  }
  return rows;
}

function buildManifest() {
  const rows = catalogRows();
  const badges = rows.map((r) => ({ slug: r.slug, token: r.token, color: r.color, webpFile: `webp/${r.slug}.webp` }));
  const tokens = {};
  for (const b of badges) {
    tokens[b.token] ??= { sourceUrl: `https://lucide.dev/icons/${b.token}`, svgFile: `svg/${b.token}.svg`, slugs: [] };
    tokens[b.token].slugs.push(b.slug);
  }
  return { license: "ISC", source: "lucide", tokens, badges };
}

async function check() {
  const manifest = JSON.parse(readFileSync(`${ASSET_ROOT}/manifest.json`, "utf8"));
  const rows = catalogRows();
  const problems = [];
  const bySlug = new Map(manifest.badges.map((b) => [b.slug, b]));
  for (const row of rows) {
    const entry = bySlug.get(row.slug);
    if (!entry) { problems.push(`slug ${row.slug} ausente na manifest`); continue; }
    if (entry.token !== row.token) problems.push(`token divergente para ${row.slug}: manifest=${entry.token} catálogo=${row.token}`);
    if (entry.color !== row.color) problems.push(`cor divergente para ${row.slug}: manifest=${entry.color} catálogo=${row.color}`);
    if (!existsSync(`${ASSET_ROOT}/svg/${entry.token}.svg`)) problems.push(`svg ausente para o token ${entry.token}`);
    if (!existsSync(`${ASSET_ROOT}/${entry.webpFile}`)) problems.push(`webp ausente para o slug ${row.slug}`);
  }
  const extra = [...bySlug.keys()].filter((s) => !rows.some((r) => r.slug === s));
  if (extra.length) problems.push(`slugs fora do catálogo na manifest: ${extra.join(", ")}`);
  if (manifest.license !== "ISC" || !String(manifest.source).includes("lucide")) problems.push("licença/fonte da manifest não declaram Lucide ISC");
  if (problems.length) {
    for (const p of problems) console.error(`PROBLEMA: ${p}`);
    process.exit(1);
  }
  console.log(`check ok: ${rows.length} badges, ${Object.keys(manifest.tokens).length} tokens, licença ISC`);
}

async function render() {
  const sharp = (await import("sharp")).default;
  const manifest = JSON.parse(readFileSync(`${ASSET_ROOT}/manifest.json`, "utf8"));
  for (const b of manifest.badges) {
    const svg = readFileSync(`${ASSET_ROOT}/svg/${b.token}.svg`, "utf8")
      .replace(/width="24"/, 'width="128"')
      .replace(/height="24"/, 'height="128"')
      .replace(/stroke="currentColor"/g, `stroke="${b.color}"`);
    const webp = await sharp(Buffer.from(svg)).resize(128, 128).webp().toBuffer();
    writeFileSync(`${ASSET_ROOT}/${b.webpFile}`, webp);
    console.log(`renderizado ${b.slug} (${b.token}, ${b.color})`);
  }
}

async function apply() {
  const manifest = JSON.parse(readFileSync(`${ASSET_ROOT}/manifest.json`, "utf8"));
  const { PrismaClient } = await import("@prisma/client");
  // O apply roda em node puro: o SDK S3 é JavaScript, e a seam da app é TypeScript — o tsx não
  // resolve import de .ts a partir de .mjs. Os envs lidos são os MESMOS da seam (S3_*).
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const endpoint = (process.env.S3_ENDPOINT || "").replace(/\/+$/, "");
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) {
    console.error("S3_ENDPOINT/S3_BUCKET ausentes — exporte as envs antes de aplicar o catálogo de ícones");
    process.exit(1);
  }
  const s3 = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true").trim() !== "false",
    credentials: { accessKeyId: (process.env.S3_ACCESS_KEY || "").trim(), secretAccessKey: process.env.S3_SECRET_KEY || "" },
  });
  const put = async (key, body) => s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: "image/webp", Body: body }));
  const prisma = new PrismaClient();
  let uploaded = 0;
  let skipped = 0;
  for (const b of manifest.badges) {
    const badge = await prisma.badges.findUnique({ where: { slug: b.slug } });
    if (!badge) { console.error(`PROBLEMA: slug ${b.slug} não está na base`); process.exit(1); }
    if (badge.iconKey) { skipped++; continue; }
    const key = `badges/${badge.id}/icon.webp`;
    const bytes = readFileSync(`${ASSET_ROOT}/${b.webpFile}`);
    await put(key, bytes);
    await prisma.badges.update({ where: { id: badge.id }, data: { iconKey: key } });
    uploaded++;
    console.log(`aplicado ${b.slug} → ${key}`);
  }
  await prisma.$disconnect();
  console.log(`apply ok: ${uploaded} subidos, ${skipped} já tinham chave`);
}

const mode = process.argv[2];
if (mode === "--check") await check();
else if (mode === "--render") await render();
else if (!mode) await apply();
else { console.error(`modo desconhecido: ${mode} (--check | --render | apply)`); process.exit(1); }
