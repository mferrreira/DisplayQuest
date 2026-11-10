/**
 * plan-v16 S05 (R7, INV5) — a manifest das 50 imagens do catálogo.
 *
 * A manifest congela o pareamento slug → token Lucide → cor → arquivo WebP, a licença de cada
 * imagem, e exige que os arquivos baixados e renderizados existam. O catálogo SQL é a fonte
 * do slug, do token (com os renomes medidos do Lucide) e da cor; divergir entre as duas listas
 * falha a guarda nomeando o slug.
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MANIFEST_PATH = "assets/badge-icons/manifest.json";
const RENAME: Record<string, string> = {
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

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

describe("manifest das imagens do catálogo", () => {
  it("declara a licença ISC da fonte Lucide", () => {
    expect(manifest.license).toBe("ISC");
    expect(manifest.source).toContain("lucide");
  });

  it("pareia os 50 slugs com o token e a cor do catálogo SQL", () => {
    const rows = catalogRows();
    expect(rows.length).toBe(50);
    const bySlug: Map<string, { slug: string; token: string; color: string; webpFile: string } | undefined> = new Map(
      manifest.badges.map((b: { slug: string; token: string; color: string; webpFile: string }) => [b.slug, b]),
    );
    expect(bySlug.size).toBe(50);
    for (const row of rows) {
      const entry = bySlug.get(row.slug);
      if (!entry) throw new Error(`slug ${row.slug} ausente na manifest`);
      expect(entry.token, `token divergente para ${row.slug}`).toBe(row.token);
      expect(entry.color, `cor divergente para ${row.slug}`).toBe(row.color);
    }
  });

  it("todo token da manifest tem o SVG baixado em assets/badge-icons/svg", () => {
    const tokens = new Set(manifest.badges.map((b: any) => b.token));
    for (const token of tokens) {
      expect(
        existsSync(`assets/badge-icons/svg/${token}.svg`),
        `svg ausente para o token ${token}`,
      ).toBe(true);
    }
  });

  it("cada badge tem seu WebP renderizado em assets/badge-icons/webp", () => {
    for (const b of manifest.badges) {
      expect(
        existsSync(`assets/badge-icons/${b.webpFile}`),
        `webp ausente para o slug ${b.slug}`,
      ).toBe(true);
    }
  });

  it("o caminho do webp nomeia o slug e a manifest cobre os 50", () => {
    for (const b of manifest.badges) {
      expect(b.webpFile).toBe(`webp/${b.slug}.webp`);
    }
  });
});
