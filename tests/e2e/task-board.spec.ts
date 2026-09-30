import { test, expect, type Page } from "@playwright/test";
import { login, apiSession } from "./helpers";

/**
 * Task-board E2E flows (E2/T2.7 closeout) — REAL backend on the dev server (:3001).
 *
 * Self-contained: the flow creates its own delegated task via the API (page.request shares
 * the logged-in context's cookies), runs it through to-do → in-review → done → adjust, then
 * DELETES it and RESTORES the coordenador's points (PUT /api/users/2 accepts points for
 * MANAGE_USERS holders). afterAll is a safety net for failed mid-flow runs (apiSession login).
 * Dev-DB residue: zero.
 *
 * Scenarios per .spec/specs/task-board.feature.md §10:
 *   board renders · delegated→review via Move menu · leader approve→done→points badge updates
 *   URL filter round-trip · keyboard-only move.
 */

const TASK_TITLE = "E2E fluxo delegada";
const COORDENADOR_ID = 2;
const TASK_POINTS = 10;

let createdTaskId: number | null = null;
let pointsBefore: number | null = null;

async function createFixtureTask(page: Page) {
  const res = await page.request.post("/api/tasks", {
    data: {
      title: TASK_TITLE,
      description: "Tarefa criada pelo teste E2E — deletada ao final.",
      status: "to-do", // single-create route does not default it (D-19)
      taskVisibility: "delegated",
      assignedTo: COORDENADOR_ID, // approval awards points to the session user → badge observable
      assigneeIds: [COORDENADOR_ID],
      points: TASK_POINTS,
      priority: "medium",
      isGlobal: false,
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  createdTaskId = body.task.id as number;
}

/** Desktop header points badge — visible-only filter skips any hidden duplicates. */
function pointsBadge(page: Page) {
  return page.locator("header span.bg-clip-text").locator("visible=true").first();
}

test.describe("task board flows", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ request }) => {
    // safety net when a mid-flow test failed: clean fixture + restore points
    if (createdTaskId == null && pointsBefore == null) return;
    await apiSession(request);
    if (createdTaskId != null) {
      await request.delete(`/api/tasks/${createdTaskId}`).catch(() => {});
    }
    if (pointsBefore != null) {
      await request
        .patch(`/api/users/${COORDENADOR_ID}/points`, {
          data: { action: "set", points: pointsBefore },
        })
        .catch(() => {});
    }
  });

  test("board renders all five lifecycle columns", async ({ page }) => {
    await login(page);
    for (const column of ["A Fazer", "Em Andamento", "Em Revisão", "Ajustes", "Concluído"]) {
      await expect(page.getByLabel(`Coluna ${column}`)).toBeVisible({ timeout: 15_000 });
    }

    // capture pre-test points for restoration + the increment assertion
    const res = await page.request.get(`/api/users/${COORDENADOR_ID}`);
    const user = await res.json();
    pointsBefore = user.user.points as number;
    expect(pointsBefore).toBeGreaterThanOrEqual(0);
  });

  test("delegated task moved via Move menu lands in Em Revisão with review toast", async ({
    page,
  }) => {
    await login(page);
    await createFixtureTask(page);

    await page.reload();
    await expect(
      page.getByRole("button", { name: `Ver detalhes de ${TASK_TITLE}` }),
    ).toBeVisible({ timeout: 15_000 });

    // Move menu (keyboard-operable drag parity): leader moving delegated → Concluído fires
    // complete; server demotes to in-review (gateway :401) and invalidation refetches.
    await page.getByRole("button", { name: `Ações para ${TASK_TITLE}` }).click();
    await page.getByRole("menuitem", { name: "Concluído" }).click();

    await expect(page.getByText(/Enviada para Revisão/i).first()).toBeVisible();
    const reviewColumn = page.getByLabel("Coluna Em Revisão");
    await expect(reviewColumn.getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });

    // server truth (polls past the optimistic window — card shows review before PATCH settles)
    await expect
      .poll(async () => {
        const res = await page.request.get(`/api/tasks/${createdTaskId}`);
        return (await res.json()).task?.status;
      }, { timeout: 10_000 })
      .toBe("in-review");
  });

  test("leader approves → card reaches Concluído → header points badge increments", async ({
    page,
  }) => {
    await login(page);
    const reviewColumn = page.getByLabel("Coluna Em Revisão");
    await expect(reviewColumn.getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });

    const badge = pointsBadge(page);
    await expect(badge).toHaveText(String(pointsBefore), { timeout: 10_000 });

    await reviewColumn.getByRole("button", { name: /aprovar/i }).click();

    await expect(page.getByText(/Tarefa aprovada/i).first()).toBeVisible();
    const doneColumn = page.getByLabel("Coluna Concluído");
    await expect(doneColumn.getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });

    // session refresh (use-tasks.ts refreshPoints) keeps the badge live without reload
    await expect(badge).toHaveText(String(pointsBefore! + TASK_POINTS), { timeout: 10_000 });

    // server truth: done + completed (poll past optimistic window)
    await expect
      .poll(async () => {
        const res = await page.request.get(`/api/tasks/${createdTaskId}`);
        const t = (await res.json()).task;
        return `${t?.status}:${t?.completed}`;
      }, { timeout: 10_000 })
      .toBe("done:true");
  });

  test("URL filter round-trip: busca drives filtered state, clear restores, deep link reproduces", async ({
    page,
  }) => {
    await login(page);
    await expect(page.getByLabel("Coluna A Fazer")).toBeVisible({ timeout: 15_000 });

    const busca = page.getByLabel("Buscar tarefas por título");
    await busca.fill("xyzzy-nenhuma-correspondencia");
    await expect(page).toHaveURL(/busca=xyzzy/);
    await expect(page.getByText("Nenhuma tarefa corresponde aos filtros")).toBeVisible();

    // empty-state "Limpar filtros" resets both URL and results
    await page.getByRole("button", { name: /limpar filtros/i }).last().click();
    await expect(page).not.toHaveURL(/busca=/);
    await expect(page.getByLabel("Coluna A Fazer")).toBeVisible({ timeout: 15_000 });

    // shareable URL reproduces the filtered view on a cold navigation
    await page.goto("/dashboard?busca=xyzzy-nenhuma-correspondencia");
    await expect(page.getByText("Nenhuma tarefa corresponde aos filtros")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("keyboard-only move + cleanup: menu-driven move to Ajustes, delete fixture, restore points", async ({
    page,
  }) => {
    await login(page);
    await expect(page.getByRole("button", { name: `Ver detalhes de ${TASK_TITLE}` })).toBeVisible({
      timeout: 15_000,
    });

    // keyboard parity (D-15.4): focus trigger, open with Enter, navigate with ArrowDown, confirm
    await page.getByRole("button", { name: `Ações para ${TASK_TITLE}` }).focus();
    await page.keyboard.press("Enter");
    // wait for Radix menu content to mount and focus first item
    await page.waitForTimeout(300);
    let moved = false;
    for (let i = 0; i < 8; i++) {
      const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
      if (focused.includes("Ajustes")) {
        await page.keyboard.press("Enter");
        moved = true;
        break;
      }
      await page.keyboard.press("ArrowDown");
      // small pause for Radix roving-focus to settle between items
      await page.waitForTimeout(100);
    }
    expect(moved, "menu never focused the Ajustes item").toBe(true);

    const adjustColumn = page.getByLabel("Coluna Ajustes");
    await expect(adjustColumn.getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => {
        const res = await page.request.get(`/api/tasks/${createdTaskId}`);
        return (await res.json()).task?.status;
      }, { timeout: 10_000 })
      .toBe("adjust");

    // cleanup inside authenticated context: restore points BEFORE deleting (task award already banked)
    const restore = await page.request.patch(`/api/users/${COORDENADOR_ID}/points`, {
      data: { action: "set", points: pointsBefore },
    });
    expect(restore.ok()).toBeTruthy();
    const del = await page.request.delete(`/api/tasks/${createdTaskId}`);
    expect(del.ok()).toBeTruthy();
    createdTaskId = null;
    pointsBefore = null;
  });
});
