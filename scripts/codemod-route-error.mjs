#!/usr/bin/env node
/**
 * scripts/codemod-route-error.mjs — B10 · D10 (DEC-125)
 *
 * Substitui os blocos `catch` das rotas que tem a DECISAO CONGELADA
 *   mapped = domainErrorResponse(error); if (mapped) return mapped; [console.error] [const message = …] return <json 500>
 * por uma chamada unica a `routeErrorResponse(error, { … })`, extraindo as opcoes do corpo
 * medido (fallback, details, exposeMessage). Blocos com qualquer outra forma (status derivado,
 * retornos extras, logica antes do mapper) sao PULADOS e reportados — o codemod nao inventa.
 *
 * Uso: node scripts/codemod-route-error.mjs [--dry-run]
 */
import ts from "typescript"
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"

const DRY = process.argv.includes("--dry-run")
const files = execSync(`git ls-files 'app/api/**/route.ts'`, { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean)

const skipped = []
const converted = []

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null
}

function analyzeCatch(clause, sf) {
  const stmts = clause.block.statements
  let i = 0

  // 1) const mapped = domainErrorResponse(error)
  const s0 = stmts[0]
  if (!ts.isVariableStatement(s0) || s0.declarationList.declarations.length !== 1) return null
  const decl0 = s0.declarationList.declarations[0]
  if (decl0.name.getText(sf) !== "mapped") return null
  if (!ts.isCallExpression(decl0.initializer) || decl0.initializer.expression.getText(sf) !== "domainErrorResponse") return null
  i++

  // 2) if (mapped) return mapped
  const s1 = stmts[1]
  if (!ts.isIfStatement(s1) || !ts.isReturnStatement(s1.thenStatement)) return null
  if (s1.thenStatement.expression?.getText(sf) !== "mapped") return null
  if (s1.elseStatement) return null
  i++

  // 3) opcional: console.error(...)
  if (i < stmts.length && ts.isExpressionStatement(stmts[i]) && stmts[i].expression.getText(sf).startsWith("console.error(")) i++

  // 4) opcional: const message = error instanceof Error ? error.message : "LIT" | undefined
  let messageFallback = null
  if (i < stmts.length && ts.isVariableStatement(stmts[i])) {
    const decl = stmts[i].declarationList.declarations[0]
    const init = decl?.initializer
    if (!decl || decl.name.getText(sf) !== "message" || !ts.isConditionalExpression(init)) return null
    const cond = init.condition.getText(sf)
    if (cond !== "error instanceof Error") return null
    if (init.whenTrue.getText(sf) !== "error.message") return null
    messageFallback = literalText(init.whenFalse) // `undefined` -> null (sem fallback na variavel)
    if (messageFallback === null && init.whenFalse.getText(sf) !== "undefined") return null
    i++
  }

  // 5) ultimo (e unico restante) statement: return <json 500>
  if (i !== stmts.length - 1) return null
  const last = stmts[i]
  if (!ts.isReturnStatement(last) || !ts.isCallExpression(last.expression)) return null

  const call = last.expression
  let objArg = null
  let statusArg = null
  if (call.expression.getText(sf) === "NextResponse.json") {
    objArg = call.arguments[0]
    statusArg = call.arguments[1]
  } else if (call.expression.getText(sf) === "new Response" || ts.isNewExpression(call)) {
    const first = call.arguments[0]
    if (!ts.isCallExpression(first) || first.expression.getText(sf) !== "JSON.stringify") return null
    objArg = first.arguments[0]
    statusArg = call.arguments[1]
  } else return null

  if (!objArg || !ts.isObjectLiteralExpression(objArg)) return null

  // status: 500 literal (toHttpStatus(error) etc. fica de fora)
  let statusOk = false
  if (ts.isObjectLiteralExpression(statusArg)) {
    for (const p of statusArg.properties) {
      if (p.name?.getText(sf) === "status" && ts.isNumericLiteral(p.initializer) && p.initializer.text === "500") statusOk = true
    }
  }
  if (!statusOk) return null

  // opcoes do corpo
  const opts = {}
  for (const p of objArg.properties) {
    const name = p.name?.getText(sf)
    const init = p.initializer
    if (name === "error") {
      const lit = literalText(init)
      if (lit !== null) {
        opts.fallback = lit
      } else if (ts.isBinaryExpression(init) && init.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
        const right = literalText(init.right)
        if (right === null) return null
        opts.exposeMessage = true
        opts.fallback = right
      } else if (ts.isIdentifier(init) && init.getText(sf) === "message") {
        opts.exposeMessage = true
        if (messageFallback !== null) opts.fallback = messageFallback
      } else return null
    } else if (name === "details") {
      const t = init?.getText(sf)
      if (t !== "error?.message" && t !== "error.message") return null
      opts.details = true
    } else return null
  }
  if (opts.exposeMessage && opts.fallback === undefined && messageFallback !== null) opts.fallback = messageFallback
  if (opts.fallback === undefined && !opts.exposeMessage) opts.fallback = "Erro interno do servidor"

  return opts
}

for (const file of files) {
  const original = readFileSync(file, "utf8")
  const sf = ts.createSourceFile(file, original, ts.ScriptTarget.ES2022, true)

  const clauses = []
  function walk(node) {
    if (ts.isCatchClause(node)) clauses.push(node)
    ts.forEachChild(node, walk)
  }
  walk(sf)

  const edits = []
  for (const clause of clauses) {
    const opts = analyzeCatch(clause, sf)
    if (!opts) {
      skipped.push(`${file}: ${clause.getText(sf).split("\n")[0]}`)
      continue
    }
    const parts = []
    if (opts.fallback !== undefined) parts.push(`fallback: ${JSON.stringify(opts.fallback)}`)
    if (opts.details) parts.push("details: true")
    if (opts.exposeMessage) parts.push("exposeMessage: true")
    const arg = parts.length ? ` { ${parts.join(", ")} }` : ""
    // indentacao real: a dos statements originais (o `{` fica no fim da linha do catch)
    const firstStmt = clause.block.statements[0]
    const innerChar = firstStmt ? sf.getLineAndCharacterOfPosition(firstStmt.getStart(sf)).character : 4
    const innerIndent = " ".repeat(innerChar)
    const closeIndent = " ".repeat(Math.max(0, innerChar - 2))
    edits.push({
      start: clause.block.getStart(sf),
      end: clause.block.getEnd(),
      text: `{\n${innerIndent}return routeErrorResponse(error,${arg})\n${closeIndent}}`,
    })
    converted.push(file)
  }

  if (edits.length === 0) continue

  let out = original
  for (const edit of edits.reverse()) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }

  // imports: garante routeErrorResponse; limpa domainErrorResponse/NextResponse se ociosos
  if (!/\brouteErrorResponse\b/.test(out.split("\n").filter((l) => !l.startsWith("import")).join("\n"))) {
    // noop — o uso foi inserido acima; nada a fazer
  }
  const body = out.replace(/^import[^\n]*\n/gm, "")
  if (!/\bdomainErrorResponse\b/.test(body)) {
    out = out.replace(/^import \{ domainErrorResponse \} from "\@\/lib\/api\/domain-error-response";?\n/gm, "")
  }
  if (!/\bNextResponse\b/.test(body)) {
    out = out.replace(/^import \{ NextResponse \} from "next\/server";?\n/gm, "")
    out = out.replace(/^import \{ NextResponse, Request \} from "next\/server";?\n/gm, 'import { Request } from "next/server";\n')
  }
  if (!out.includes('import { routeErrorResponse } from "@/lib/api/route-error-response"')) {
    const importAnchor = out.match(/^import[^\n]*\n/m)
    const anchorIdx = importAnchor ? importAnchor.index + importAnchor[0].length : 0
    out = out.slice(0, anchorIdx) + 'import { routeErrorResponse } from "@/lib/api/route-error-response"\n' + out.slice(anchorIdx)
  }

  if (!DRY) writeFileSync(file, out)
}

console.log(`convertidos: ${converted.length} blocos em ${new Set(converted).size} arquivos`)
console.log(`pulados: ${skipped.length}`)
for (const s of skipped) console.log(`  SKIP ${s}`)
