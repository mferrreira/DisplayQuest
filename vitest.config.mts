import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, ".") };
const exclude = ["tests/e2e/**", "node_modules/**", ".next/**"];

/**
 * ── por que a integração é um projeto separado e serializado ─────────────────────────────
 *
 * Os roundtrips G4 (`tests/integration/**`) compartilham UM banco — o `dq-dev-test-db` em
 * 127.0.0.1:5433 (DEC-10/BLOCKER-02) — e o Vitest roda arquivos em paralelo por padrão. Isso
 * produzia falha real, medida em ~1 a cada 6 corridas da suíte de integração e 1 em 5 da suíte
 * completa. Dois modos, ambos colisão de harness e não defeito da aplicação:
 *
 *   (a) `bulkGenerateWeeklyReports` resolve a lista de usuários ativos UMA vez e itera período
 *       por período; `users-roundtrip` cria, aprova e APAGA um usuário no mesmo intervalo, e o
 *       bulk encontra um usuário já apagado → NotFoundError "Usuário não encontrado".
 *   (b) o relatório gerado para o usuário criado por `users-roundtrip` trava o `users.delete`
 *       pela FK `weekly_reports_userId_fkey`.
 *
 * Serializar só esse grupo remove a classe inteira. Serializar TUDO (o primeiro ensaio) também
 * remove, mas custa: suíte completa 35s → 115s e o G3 (`tests/unit features`) 30s → 102s, e o
 * G3 não toca estado externo nenhum — pagaríamos 72s por uma concorrência que não colide.
 * Com projetos (medido): completa 47s, G3 35s, G4 10/83 verde em 6 corridas seguidas.
 *
 * ── o que cada projeto precisa repetir, e por quê ─────────────────────────────────────────
 *
 * Projeto de workspace NÃO herda do config raiz. Cada item abaixo foi omitido uma vez e quebrou
 * de um jeito diferente; estão aqui porque a próxima pessoa que mexer neste arquivo vai tentar
 * de novo:
 *
 *   `resolve.alias`  → sem ele, `@/lib/database/prisma` dos roundtrips vira
 *                      "Cannot find package '@/lib/database/prisma'" (20 arquivos, 0 testes).
 *   `exclude`        → sem ele, `tests/e2e/**` entra como suíte falha: 170 arquivos em vez de
 *                      83, 1826 testes em vez de 1017.
 *   `plugins: [react()]` → sem ele, `.tsx` falha no parse ("Unexpected JSX expression",
 *                      "invalid JS syntax") em 15 arquivos.
 *   `setupFiles`     → sem ele, os shims de jsdom de `tests/setup.ts` (Radix:
 *                      `hasPointerCapture`/`ResizeObserver`/`scrollIntoView`) não existem e 84
 *                      testes falham em silêncio.
 *   `environment`    → o default do projeto é `node`; sem declarar `jsdom` no projeto unit, os
 *                      mesmos 15 arquivos falham.
 *
 * Os testes de integração continuam declarando `// @vitest-environment node` no próprio arquivo;
 * o `environment` do projeto é redundante com isso e está aqui só para o projeto não herdar jsdom.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude,
    css: false,
    projects: [
      {
        name: "unit",
        resolve: { alias },
        plugins: [react()],
        test: {
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          exclude,
          include: [
            "tests/unit/**/*.test.{ts,tsx}",
            "features/**/__tests__/**/*.test.{ts,tsx}",
            "entities/**/*.test.{ts,tsx}",
          ],
        },
      },
      {
        name: "integration",
        resolve: { alias },
        plugins: [react()],
        test: {
          environment: "node",
          setupFiles: ["./tests/setup.ts"],
          exclude,
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          fileParallelism: false,
        },
      },
    ],
  },
});
