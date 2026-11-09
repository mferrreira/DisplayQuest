/**
 * plan-v13 S02 — a peça única de markdown da descrição do projeto (regra 2 do MODELO.md).
 *
 * O que entra no aceite:
 *   1. Markdown comum vira estrutura: título, negrito, lista, link.
 *   2. HTML cru é ESCAPADO — `html:false` é a garantia de injeção, e o teste a prova.
 *   3. Links saem com `rel="noopener noreferrer"`; URL de protocolo perigoso (`javascript:`)
 *      não vira link.
 *   4. Linkify: URL nua vira âncora.
 */
import { describe, expect, it } from "vitest";

import { renderProjectMarkdown } from "@/lib/markdown-render";

describe("renderProjectMarkdown", () => {
  it("markdown comum vira estrutura", () => {
    const html = renderProjectMarkdown("**negrito**\n\n- a\n- b");
    expect(html).toContain("<strong>negrito</strong>");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>b</li>");
  });

  it("HTML cru é escapado, nunca interpretado", () => {
    const html = renderProjectMarkdown("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(renderProjectMarkdown("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });

  it("link markdown sai com rel noopener", () => {
    const html = renderProjectMarkdown("[Site do lab](https://lab.com)");
    expect(html).toMatch(/<a[^>]*href="https:\/\/lab\.com"[^>]*rel="noopener noreferrer"/);
  });

  it("URL javascript: não vira link", () => {
    const html = renderProjectMarkdown("[clique](javascript:alert(1))");
    expect(html).not.toMatch(/<a[^>]*href="javascript/i);
  });

  it("URL nua é linkificada", () => {
    const html = renderProjectMarkdown("visite https://lab.com");
    expect(html).toMatch(/<a[^>]*href="https:\/\/lab\.com"/);
  });
});
