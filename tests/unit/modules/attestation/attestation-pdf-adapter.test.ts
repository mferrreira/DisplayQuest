// @vitest-environment node
/**
 * V5-10a (DEC-130) — o adaptador AcroForm do atestado, medido no byte real que ele entrega.
 *
 * Como este arquivo prova (medição de 2026-10-14 no fork @cantoo/pdf-lib):
 *   - `flatten` mescla a aparência de cada campo como um Form XObject `FlatWidget*` na
 *     página — os 42 campos do oficial aparecem achatados, e o AcroForm some do arquivo.
 *   - texto escrito sai na aparência como hex de 1 byte por caractere (`<42656E746F...> Tj`,
 *     Times-Roman); o valor bruto `/V` sai UTF-16BE. O probe daqui é o hex da aparência.
 *   - checkbox marcado desenha o X do próprio oficial (`14 14 m ... S`); desmarcado desenha
 *     só o recheio branco. O probe discrimina os dois estados.
 *   - o asset na disk não é tocado: o sha256 do template é o mesmo antes e depois de render.
 *
 * Gotchas medidos no caminho, congelados aqui para quem mexer: no fork o nome da fonte é
 * `TimesRoman` (não `Times`); `PDFRawStream` não tem `decode()`; o contexto não expõe
 * `objects()` — é `enumerateIndirectObjects()`; e a aparência achatada mora no XObject da
 * página, não na content stream — procurar na content stream dá falso negativo.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { PDFDict, PDFDocument, PDFName, PDFObject, PDFPage, PDFRef } from "@cantoo/pdf-lib";
import { describe, expect, it } from "vitest";

import { AcroFormAttestationAdapter } from "@/backend/modules/attestation/infrastructure/adapters/acroform-attestation.adapter";

const TEMPLATE_PATH = path.resolve(__dirname, "../../../../templates/atestado-frequencia.pdf");

const adapter = new AcroFormAttestationAdapter(TEMPLATE_PATH);

/** Hex de 1 byte por caractere, MAIÚSCULO — a grafia da aparência medida (WinAnsi do Times-Roman). */
function appearanceHex(value: string): string {
  return Buffer.from(value, "latin1").toString("hex").toUpperCase();
}

async function loadRendered(fields: Record<string, string | boolean>) {
  const bytes = await adapter.renderPdf(fields);
  return PDFDocument.load(bytes);
}

/** O `lookup` do contexto devolve `PDFObject` — o teste estreita na mão (gotcha do fork). */
type DictLike = PDFDict;
type StreamLike = PDFObject & { getContents?: () => Uint8Array; contents?: Uint8Array };

function resourcesOf(doc: PDFDocument, page: PDFPage): DictLike | undefined {
  const resources = doc.context.lookup(page.node.get(PDFName.of("Resources")));
  return resources instanceof PDFDict ? resources : undefined;
}

function xobjectsOf(doc: PDFDocument, page: PDFPage): DictLike | undefined {
  const resources = resourcesOf(doc, page);
  const xobjects = resources?.get(PDFName.of("XObject"));
  const dict = xobjects instanceof PDFRef ? doc.context.lookup(xobjects) : xobjects;
  return dict instanceof PDFDict ? dict : undefined;
}

function streamText(doc: PDFDocument, ref: PDFObject): string {
  const stream = doc.context.lookup(ref) as StreamLike | undefined;
  const raw = Buffer.from(stream?.getContents?.() ?? stream?.contents ?? new Uint8Array());
  try {
    return zlib.inflateSync(raw).toString("latin1");
  } catch {
    return raw.toString("latin1");
  }
}

function flatWidgetCorpus(doc: PDFDocument): string {
  const parts: string[] = [];
  for (const page of doc.getPages()) {
    const xobjects = xobjectsOf(doc, page);
    if (!xobjects) continue;
    for (const [nameRef, ref] of xobjects.entries()) {
      if (!String(nameRef).includes("FlatWidget")) continue;
      parts.push(streamText(doc, ref));
    }
  }
  return parts.join("");
}

describe("AcroFormAttestationAdapter (V5-10a, DEC-130)", () => {
  it("entrega o oficial ACHATADO: sem AcroForm, 2 páginas, os 42 campos mesclados", async () => {
    const doc = await loadRendered({});
    expect(doc.getForm().getFields()).toHaveLength(0);
    expect(doc.getPageCount()).toBe(2);
    const flatCount = doc.getPages().reduce((total, page) => {
      const dict = xobjectsOf(doc, page);
      if (!dict) return total;
      let count = 0;
      for (const [nameRef] of dict.entries()) if (String(nameRef).includes("FlatWidget")) count += 1;
      return total + count;
    }, 0);
    expect(flatCount).toBe(42);
  });

  it("texto recebe valor sai na aparência em hex, na fonte Times-Roman", async () => {
    const corpus = flatWidgetCorpus(await loadRendered({ nome: "Bento Lima", data: "setembro" }));
    expect(corpus).toContain(appearanceHex("Bento Lima"));
    expect(corpus).toContain(appearanceHex("setembro"));
    expect(corpus).toContain("/Times-Roman");
  });

  it("checkbox marcado desenha o X do oficial; desmarcado desenha só o recheio", async () => {
    const checked = flatWidgetCorpus(await loadRendered({ is_pibic: true }));
    const unchecked = flatWidgetCorpus(await loadRendered({}));
    expect(checked).toContain("14 14 m"); // o X do oficial: 14 14 m 0 0 l S
    expect(unchecked).not.toContain("14 14 m");
  });

  it("campo que não recebeu valor não escreve nada", async () => {
    const corpus = flatWidgetCorpus(await loadRendered({ nome: "Bento Lima" }));
    expect(corpus).not.toContain(appearanceHex("setembro"));
    expect(corpus).not.toContain(appearanceHex("123.456.789-01"));
  });

  it("o asset oficial na disk não é tocado — o sha256 é o mesmo antes e depois", async () => {
    const before = createHash("sha256").update(readFileSync(TEMPLATE_PATH)).digest("hex");
    await adapter.renderPdf({ nome: "Qualquer coisa" });
    const after = createHash("sha256").update(readFileSync(TEMPLATE_PATH)).digest("hex");
    expect(after).toBe(before);
  });
});
