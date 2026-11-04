/**
 * plan-v13 S07 — captura de fatia do pódio glorioso.
 *
 * Percorre /dashboard/projetos na instância em execução, nos dois temas e nos dois viewports
 * do manifest (`docs/ui-reference/manifest.json`: desktop 1440x900, mobile 390x844), mede o
 * WebGL headless do Chromium, verifica que o pódio está na tela (cena quando WebGL, cards
 * sr-only quando não) e grava os PNGs.
 *
 * Uso: node scripts/capture-slice.mjs <sliceId> [port]
 * Credenciais: docs/.capture.env (DQ_CAPTURE_URL / DQ_CAPTURE_EMAIL / DQ_CAPTURE_PASSWORD).
 */
import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"
import { readFileSync } from "node:fs"
import path from "node:path"

const slice = process.argv[2]
const port = process.argv[3] ?? "3000"
if (!slice) {
  console.error("uso: node scripts/capture-slice.mjs <sliceId> [port]")
  process.exit(2)
}

const env = Object.fromEntries(
  readFileSync("docs/.capture.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
)
if (!env.DQ_CAPTURE_URL || !env.DQ_CAPTURE_EMAIL || !env.DQ_CAPTURE_PASSWORD) {
  console.error("faltam DQ_CAPTURE_URL / DQ_CAPTURE_EMAIL / DQ_CAPTURE_PASSWORD em docs/.capture.env")
  process.exit(2)
}

const base = env.DQ_CAPTURE_URL
const outDir = path.resolve("tests/e2e/__screenshots__", `slice-${slice}`)
mkdirSync(outDir, { recursive: true })

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900 },
  { id: "mobile", width: 390, height: 844 },
]
const THEMES = ["light", "dark"]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: VIEWPORTS[0], storageStates: [] })
const page = await ctx.newPage()

await page.goto(`${base}/login`, { waitUntil: "networkidle" })
await page.fill("#email", env.DQ_CAPTURE_EMAIL)
await page.fill("#password", env.DQ_CAPTURE_PASSWORD)
await page.getByRole("button", { name: "Entrar" }).click()
await page.waitForURL(/dashboard/, { timeout: 15_000 })

const webgl = await page.evaluate(() => {
  const c = document.createElement("canvas")
  return Boolean(c.getContext("webgl2") || c.getContext("webgl"))
})
console.log(`[slice] WebGL do Chromium headless: ${webgl ? "sim" : "não"}`)

for (const theme of THEMES) {
  await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme)
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`${base}/dashboard/projetos`, { waitUntil: "networkidle", timeout: 60_000 })
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark")
      document.documentElement.classList.toggle("light", t === "light")
    }, theme)
    // o pódio mora na aba Dashboard; o tab default é Lista (DEC-186: a aba é da gestão)
    await page.getByRole("tab", { name: "Dashboard" }).click()
    // o canvas do pódio entra via next/dynamic com ssr:false — ele chega num frame depois
    const canvasRegion = page.locator('[aria-label="Pódio dos projetos em três dimensões"]')
    await canvasRegion.waitFor({ state: "attached", timeout: 20_000 })
    // a rajada de temas e viewports assenta assíncrona; espera o canvas aparecer
    await page.waitForTimeout(1500)
    const podium = page.locator('[aria-label="Pódio dos projetos"]')
    await podium.waitFor({ state: "visible", timeout: 15_000 })
    const canvasCount = await page.locator('[aria-label="Pódio dos projetos em três dimensões"] canvas').count()
    const championCard = page.locator('[aria-label="Campeão dos projetos"]')
    const srOnly = (await championCard.getAttribute("class"))?.includes("sr-only")
    console.log(
      `[slice] ${theme}/${vp.id}: canvas=${canvasCount}, card-campeão sr-only=${srOnly}, webgl=${webgl}`
    )
    if (webgl && canvasCount === 0) {
      console.error(`AVISO: webgl medido como sim, mas nenhum canvas do pódio na tela`)
      process.exit(1)
    }
    if (srOnly) {
      console.error(`AVISO: a lista DOM do pódio deve ficar visível e keyboard-accessible nos dois casos (sr-only=${srOnly})`)
      process.exit(1)
    }
    await page.screenshot({ path: path.join(outDir, `projetos-dashboard-${theme}-${vp.id}.png`) })
  }
}

await browser.close()
console.log(`[slice] ${THEMES.length * VIEWPORTS.length} capturas em ${outDir}`)
