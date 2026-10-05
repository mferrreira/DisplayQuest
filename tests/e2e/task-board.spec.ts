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
 *
 * plan-v3 OND3-A (AC-P3-06) acrescenta o cenário de altura de coluna. É o ÚNICO lugar onde
 * altura limitada e scroll por coluna são verificáveis: jsdom não calcula layout, e um teste
 * unitário que só lesse className seria teatro.
 */

const TASK_TITLE = "E2E fluxo delegada";
const COORDENADOR_ID = 2;
const TASK_POINTS = 10;

/* --- OND3-A: fixtures de estouro de coluna (a altura limitada é o que se prova) --- */

const OVERFLOW_TITLE = "E2E coluna com scroll";
/** 8 cartões de ~280 px medidos = ~2.240 px de conteúdo contra ~580 px visíveis. */
const OVERFLOW_TASKS = 8;
let overflowTaskIds: number[] = [];

async function createOverflowTasks(page: Page) {
  for (let i = 1; i <= OVERFLOW_TASKS; i++) {
    const res = await page.request.post("/api/tasks", {
      data: {
        title: `${OVERFLOW_TITLE} ${i}`,
        description: "Tarefa criada pelo teste de altura de coluna — deletada ao final.",
        status: "to-do",
        taskVisibility: "delegated",
        priority: "medium",
        isGlobal: false,
      },
    });
    expect(res.status()).toBe(201);
    overflowTaskIds.push((await res.json()).task.id as number);
  }
}

async function deleteOverflowTasks(page: Page) {
  for (const id of overflowTaskIds) {
    await page.request.delete(`/api/tasks/${id}`).catch(() => {});
  }
  overflowTaskIds = [];
}

let createdTaskId: number | null = null;
let pointsBefore: number | null = null;

/* --- OND3-C: fixtures de ordenação (3 tarefas com prazo e prioridade discordantes) --- */

const ORDER_TITLE = "E2E ordem";

/** Ordem dos cartões de uma coluna, lida pelo rótulo de "Ver detalhes" de cada cartão. */
async function cardOrder(page: Page, column: string): Promise<string[]> {
  const rotulos = await page
    .getByLabel(`Coluna ${column}`)
    .getByRole("button", { name: /^Ver detalhes de / })
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return rotulos.map((rotulo) => rotulo.replace(/^Ver detalhes de /, ""));
}

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

/**
 * Desktop header points badge — o número que conta (V4-2).
 *
 * Antes era `header span.bg-clip-text` com filtro de visível, porque o menu do cabeçalho também
 * renderiza um `span.bg-clip-text` com "N pontos" e o locator casava com os dois. O contador tem
 * `data-testid` desde o V4-2, então a seleção não depende mais de classe de estilo.
 */
function pointsBadge(page: Page) {
  return page.getByTestId("points-total");
}

test.describe("task board flows", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ request }) => {
    // safety net when a mid-flow test failed: clean fixture + restore points
    if (overflowTaskIds.length > 0) {
      await apiSession(request);
      for (const id of overflowTaskIds) {
        await request.delete(`/api/tasks/${id}`).catch(() => {});
      }
      overflowTaskIds = [];
    }
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
    // `Number.isFinite`, e NAO `>= 0`. Medido na instância real em 2026-10-05: o Coordenador está
    // em -20 e o Gerente em -31030, porque a penalidade de atraso **não tem piso** (DEC-39) e o
    // dono usa o sistema de verdade. A suposição "pontos nunca são negativos" já estava sendo
    // refutada pelo próprio banco — a suíte e2e parava no primeiro teste antes de qualquer
    // mudança deste lote.
    expect(Number.isFinite(pointsBefore)).toBe(true);
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

    // V4-2 (DEC-59): quem conta gradualmente é o número do CABEÇALHO. A prova é a **sequência**
    // de valores que o elemento assumiu — um salto direto de `pointsBefore` para o valor novo não
    // produz intermediário nenhum, e era exatamente isso que acontecia antes deste lote.
    //
    // O registro é feito por um MutationObserver dentro da página, e não por poll do Playwright,
    // por causa de tempo: a contagem dura 1 s e o chip vive 1,9 s. Um poll que só começa depois
    // das outras asserções chega depois da animação e não vê nada — foi assim que esta suíte
    // falhou na primeira versão deste teste.
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='points-total']");
      if (!el) throw new Error("contador do cabeçalho ausente na página");
      const seen = new Set<string>();
      const record = () => seen.add((el.textContent ?? "").trim());
      record();
      const observer = new MutationObserver(record);
      observer.observe(el, { childList: true, subtree: true, characterData: true });
      (window as unknown as Record<string, unknown>).__dqPointsSeen = seen;
      (window as unknown as Record<string, unknown>).__dqPointsObserver = observer;
    });

    await reviewColumn.getByRole("button", { name: /aprovar/i }).click();

    // plan-v3 OND4-B: o chip do prêmio creditado aparece no contador e some sozinho. V4-2 mudou
    // o que ele mostra: o valor FINAL de imediato (a contagem foi para o total). Só aparece aqui
    // porque o fixture entrega a tarefa ao PRÓPRIO aprovador (`assignedTo: COORDENADOR_ID`): a
    // aprovação credita o responsável, e sem essa coincidência o chip — e o próprio badge — não
    // mexeriam (ver DEC-48).
    //
    // Vem antes das asserções do quadro porque o chip tem prazo: 1,9 s depois do anúncio ele
    // sai da loja, e as asserções de coluna têm orçamento de 15 s.
    const delta = page.getByTestId("points-delta");
    await expect(delta).toBeVisible({ timeout: 10_000 });

    // Medição atômica: caixa do chip, caixa da pílula e texto lidos na MESMA passada, com o
    // chip ainda na tela. Asserções separadas (`toBeVisible` → `toHaveText` → `boundingBox`)
    // somam ida e volta ao navegador, e o chip vive 1,9 s a partir do anúncio — a última
    // chegava depois de ele sair e `boundingBox` devolvia `null`. Foi assim que este teste
    // falhou de forma intermitente.
    let medida: { chip: NonNullable<Awaited<ReturnType<typeof delta.boundingBox>>>; pill: NonNullable<Awaited<ReturnType<typeof delta.boundingBox>>>; texto: string } | null = null;
    await expect
      .poll(
        async () => {
          const chip = await delta.boundingBox();
          if (!chip) return false;
          const pill = await delta.locator("xpath=..").boundingBox();
          if (!pill) return false;
          medida = { chip, pill, texto: (await delta.textContent()) ?? "" };
          return true;
        },
        { timeout: 8000, intervals: [50] },
      )
      .toBe(true);

    // plan-v3 OND4-B: o chip mostra o prêmio creditado. V4-2 mudou o que ele mostra: o valor
    // FINAL de imediato (a contagem foi para o total). Só aparece aqui porque o fixture entrega
    // a tarefa ao PRÓPRIO aprovador (`assignedTo: COORDENADOR_ID`): a aprovação credita o
    // responsável, e sem essa coincidência o chip — e o próprio badge — não mexeriam (DEC-48).
    expect(medida!.texto).toContain("+10");
    // Geometria é do navegador, não do jsdom. Duas coisas:
    //  (a) o chip precisa ficar dentro da janela. A versão primeira era `-top-5` e o topo da
    //      pílula fica a ~15px do topo da página — o chip saía pela borda.
    //  (b) o chip precisa continuar CENTRADO na pílula enquanto percorre os 10px do eixo Y.
    //      É a prova medida de que `translate` (o `-translate-x-1/2`) e `transform` (o
    //      `@keyframes enter`) compõem: se um sobrescrevesse o outro, o centro do chip sairia do
    //      centro da pílula em ~50% (o valor do `-translate-x-1/2`).
    expect(medida!.chip.y, "chip cortado pelo topo da janela").toBeGreaterThan(0);
    const chipCenterX = medida!.chip.x + medida!.chip.width / 2;
    const pillCenterX = medida!.pill.x + medida!.pill.width / 2;
    expect(
      Math.abs(chipCenterX - pillCenterX),
      "chip desalinhado da pílula: o movimento em Y comeu o -translate-x-1/2",
    ).toBeLessThanOrEqual(2);

    // session refresh (use-tasks.ts refreshPoints) keeps the badge live without reload
    await expect(badge).toHaveText(String(pointsBefore! + TASK_POINTS), { timeout: 10_000 });

    // A contagem, lida do que a página registrou durante o segundo em que ela aconteceu.
    const seenRaw = await page.evaluate(() => {
      const observer = (window as unknown as Record<string, MutationObserver>).__dqPointsObserver;
      observer?.disconnect();
      return [...((window as unknown as Record<string, Set<string>>).__dqPointsSeen ?? [])];
    });
    const seen = seenRaw.map(Number).filter(Number.isFinite);
    const intermediarios = seen.filter((v) => v > pointsBefore! && v < pointsBefore! + TASK_POINTS);
    expect(
      intermediarios.length,
      `o total saltou direto, sem contar (visto na página: ${seen.join(", ")})`,
    ).toBeGreaterThan(0);

    await expect(page.getByText(/Tarefa aprovada/i).first()).toBeVisible();
    const doneColumn = page.getByLabel("Coluna Concluído");
    await expect(doneColumn.getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });

    await expect(delta).toBeHidden({ timeout: 10_000 });

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

    // O buscador é expansível (ícone de lupa): sem abrir, o input existe mas fica oculto.
    await page.getByRole("button", { name: "Buscar tarefas" }).click();
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

  /**
   * plan-v3 OND3-A / AC-P3-06 — a coluna tem altura limitada, rola por conta própria e mantém o
   * cabeçalho no lugar; a página não cresce com o conteúdo.
   *
   * O fixture é criado pelo próprio teste (8 tarefas em A Fazer) para que a prova não dependa
   * do que existe na base: com conteúdo abaixo, `scrollHeight > clientHeight` tem de valer.
   */
  test("coluna limitada em altura, com scroll próprio e cabeçalho fixo", async ({ page }) => {
    await login(page);
    await createOverflowTasks(page);
    try {
      await page.reload();
      const column = page.getByLabel("Coluna A Fazer");
      await expect(column.getByText(`${OVERFLOW_TITLE} 1`)).toBeVisible({ timeout: 15_000 });

      const geometry = await column.evaluate((el) => ({
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
        overscrollY: getComputedStyle(el).overscrollBehaviorY,
        viewportHeight: window.innerHeight,
        docHeight: document.documentElement.scrollHeight,
      }));

      // 1. a coluna não é a página inteira: altura abaixo da janela…
      expect(geometry.clientHeight).toBeLessThan(geometry.viewportHeight);
      // 2. …e o conteúdo é maior que ela, então o scroll é da coluna (overflow-y: auto)
      expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
      expect(geometry.overflowY).toBe("auto");
      // 3. a página não cresce com o número de cartões: uma tela e meia cobrem o quadro
      expect(geometry.docHeight).toBeLessThan(geometry.viewportHeight * 1.5);

      // 4. rolar a coluna não arrasta a página (overscroll-contain) e o cabeçalho fica
      const header = page.getByRole("heading", { name: "A Fazer", exact: true });
      /** Mesma leitura antes e depois — comparar tipos diferentes seria medir outra coisa. */
      const snapshot = () =>
        page.evaluate(() => {
          const column = document.querySelector('[aria-label="Coluna A Fazer"]')!;
          const headerEl = column.parentElement!.firstElementChild as HTMLElement;
          return {
            pageY: Math.round(window.scrollY),
            headerTop: Math.round(headerEl.getBoundingClientRect().top),
            titleTop: Math.round(headerEl.querySelector("h2")!.getBoundingClientRect().top),
          };
        });

      const before = await snapshot();
      await column.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect
        .poll(async () => column.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      const after = await snapshot();

      expect(after.pageY).toBe(0); // o scroll da coluna não encadeia para a página
      expect(after.headerTop).toBe(before.headerTop);
      expect(after.titleTop).toBe(before.titleTop);
      await expect(header).toBeVisible();
      expect(geometry.overscrollY).toContain("contain");
    } finally {
      await deleteOverflowTasks(page);
    }
  });

  /**
   * plan-v3 OND3-C / AC-P3-07 — a coluna ordena pela ordem escolhida e a escolha fica guardada
   * por pessoa (DEC-33).
   *
   * jsdom não recarrega a página, então **não** prova a parte que importa aqui: que a preferência
   * sobrevive a um `reload`. Este teste cria 3 tarefas com prazo e prioridade discordantes (para
   * que "Urgência" e "Prazo" discordem), filtra o quadro pelo título delas para comparar a ordem
   * exata, troca a ordem, recarrega e confere que a ordem voltou — e que o menu reabre marcando
   * o que está valendo.
   */
  test("ordem da coluna escolhida sobrevive ao recarregar (guardada por pessoa)", async ({ page }) => {
    await login(page);
    const criadas: Array<{ title: string; dueDate: string; priority: string }> = [
      { title: `${ORDER_TITLE} 1`, dueDate: "2026-12-31", priority: "low" },
      { title: `${ORDER_TITLE} 2`, dueDate: "2026-11-10", priority: "urgent" },
      { title: `${ORDER_TITLE} 3`, dueDate: "2026-10-05", priority: "medium" },
    ];
    const criadasIds: number[] = [];
    try {
      for (const tarefa of criadas) {
        const res = await page.request.post("/api/tasks", {
          data: {
            title: tarefa.title,
            description: "Tarefa criada pelo teste de ordenação — deletada ao final.",
            status: "to-do",
            taskVisibility: "delegated",
            priority: tarefa.priority,
            dueDate: tarefa.dueDate,
            isGlobal: false,
          },
        });
        expect(res.status()).toBe(201);
        criadasIds.push(((await res.json()) as { task: { id: number } }).task.id);
      }

      // o filtro de busca (URL) é o que permite comparar a ordem exata: sem ele, a coluna tem as
      // tarefas que já estavam na base
      await page.goto(`/dashboard?busca=${encodeURIComponent(ORDER_TITLE)}`);
      await expect(page.getByLabel("Coluna A Fazer").getByText(`${ORDER_TITLE} 1`)).toBeVisible({
        timeout: 15_000,
      });

      // urgência: a urgente primeiro, depois a média, depois a baixa
      expect(await cardOrder(page, "A Fazer")).toEqual([
        `${ORDER_TITLE} 2`,
        `${ORDER_TITLE} 3`,
        `${ORDER_TITLE} 1`,
      ]);

      await page.getByRole("button", { name: "Ordenar tarefas de A Fazer" }).click();
      await expect(page.getByRole("menuitemradio", { name: "Urgência" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await page.getByRole("menuitemradio", { name: "Prazo" }).click();
      await expect.poll(async () => cardOrder(page, "A Fazer")).toEqual([
        `${ORDER_TITLE} 3`,
        `${ORDER_TITLE} 2`,
        `${ORDER_TITLE} 1`,
      ]);

      // a preferência está no navegador da pessoa, na chave que o storage deriva
      const guardada = await page.evaluate(() =>
        Object.keys(window.localStorage)
          .filter((key) => key.includes("column-order"))
          .map((key) => `${key}=${window.localStorage.getItem(key)}`),
      );
      expect(guardada).toContain(`dq:column-order:${COORDENADOR_ID}:to-do="prazo"`);

      // e a prova que o jsdom não dá: depois de recarregar, a ordem é a mesma
      await page.reload();
      await expect(page.getByLabel("Coluna A Fazer").getByText(`${ORDER_TITLE} 1`)).toBeVisible({
        timeout: 15_000,
      });
      expect(await cardOrder(page, "A Fazer")).toEqual([
        `${ORDER_TITLE} 3`,
        `${ORDER_TITLE} 2`,
        `${ORDER_TITLE} 1`,
      ]);
      await page.getByRole("button", { name: "Ordenar tarefas de A Fazer" }).click();
      await expect(page.getByRole("menuitemradio", { name: "Prazo" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } finally {
      for (const id of criadasIds) {
        await page.request.delete(`/api/tasks/${id}`).catch(() => {});
      }
    }
  });

  /**
   * V4-3 (DEC-58) — o caso que o dono relatou, medido no navegador.
   *
   * "Um voluntário com 0 pts conclui a tarefa, ela vai pra revisão e o líder aprova. Quando o
   * usuário entra no sistema de novo ou dá refresh na página, lá só aparece os 10, sem animação."
   *
   * O prêmio é creditado na sessão de quem aprova, então o cliente de quem concluiu nunca vê o
   * número. O caminho é o baseline por pessoa no navegador. Este teste reproduz o essencial sem
   * precisar de dois usuários: o navegador "lembra" de ter visto um valor 30 menor do que o real,
   * e ao abrir o sistema o contador tem de percorrer essa distância — não mostrar o destino de
   * imediato.
   *
   * O registro é feito por `addInitScript`, que roda antes de qualquer script da página: a
   * contagem dura 1 s e começa na montagem do cabeçalho, que acontece durante a navegação do
   * login. Um observador instalado depois do `login()` chega atrasado — foi assim que a primeira
   * versão do teste da animação falhou.
   */
  test("catch-up: o número conta a partir do que o navegador lembra de ter visto (DEC-58)", async ({
    page,
    request,
  }) => {
    await apiSession(request);
    const current = (await (await request.get(`/api/users/${COORDENADOR_ID}`)).json()).user.points as number;
    const lembrado = current - 30;

    await page.addInitScript(
      ([chave, valor]: string[]) => {
        window.localStorage.setItem(chave, valor);
        const w = window as unknown as { __dqPointsSeen?: string[] };
        w.__dqPointsSeen = [];
        const attach = (): boolean => {
          const el = document.querySelector("[data-testid='points-total']");
          if (!el) return false;
          const record = () => {
            const value = (el.textContent ?? "").trim();
            if (w.__dqPointsSeen && w.__dqPointsSeen.at(-1) !== value) w.__dqPointsSeen.push(value);
          };
          record();
          new MutationObserver(record).observe(el, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          return true;
        };
        if (!attach()) {
          const observer = new MutationObserver(() => {
            if (attach()) observer.disconnect();
          });
          observer.observe(document, { childList: true, subtree: true });
        }
      },
      [`dq:points-seen:${COORDENADOR_ID}`, String(lembrado)],
    );

    await login(page);

    const badge = pointsBadge(page);
    // O destino é alcançado.
    await expect(badge).toHaveText(String(current), { timeout: 10_000 });

    const visto = await page.evaluate(() => (window as unknown as { __dqPointsSeen?: string[] }).__dqPointsSeen ?? []);
    const numeros = visto.map(Number).filter(Number.isFinite);

    // Começou no valor lembrado, não no real: é isto que separa "animou a mudança" de "mostrou
    // o total". Se o primeiro número observado já for o destino, não houve contagem nenhuma.
    expect(numeros[0], `contador começou em ${numeros[0]}, não no valor lembrado`).toBe(lembrado);
    const intermediarios = numeros.filter((v) => v > lembrado && v < current);
    expect(intermediarios.length, `o total saltou direto (visto: ${numeros.join(", ")})`).toBeGreaterThan(0);

    // E a baseline avançou: reabrir não conta a mesma coisa duas vezes.
    const guardadoAgora = await page.evaluate(
      (chave) => window.localStorage.getItem(chave),
      `dq:points-seen:${COORDENADOR_ID}`,
    );
    expect(Number(guardadoAgora)).toBe(current);
  });
});
