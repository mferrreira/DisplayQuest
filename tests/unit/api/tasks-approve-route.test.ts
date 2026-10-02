// @vitest-environment node
/**
 * plan-v3 OND1-D (AC-P3-03) — a superfície HTTP de tarefa não aceita pontuação do cliente.
 *
 * DEC-30: toda tarefa vale POINTS_PER_TASK; quem cria ou edita não define valor.
 * DEC-40: `tasks.points` fica como histórico — logo, nenhuma rota pode GRAVAR valor novo a
 *          partir do corpo da requisição, nem reaproveitar o que está na coluna.
 *
 * O nome do arquivo segue o previsto no PLAN.md (§ Onda 1) porque é a aprovação que carrega
 * o prêmio; os dois primeiros blocos (criar e editar) são a mesma garantia vista pelas outras
 * bordas — comportamento visível, então entra no mesmo arquivo.
 *
 * O que este arquivo prova, com a rota real (não o use case):
 *  - `POST /api/tasks`         ignora `points` do corpo → createTaskRecord aplica 10;
 *  - `POST /api/tasks` (bulk)  ignora `points` do corpo;
 *  - `PUT /api/tasks/[id]`     `points` saiu de `allowedFields` → editar não redefine valor;
 *  - `POST /api/tasks/[id]/approve` nunca lê o corpo: o prêmio é decidido no domínio.
 *    (A Onda 4.1 estende este arquivo com o `awardedPoints` na resposta.)
 *
 * Sem isto, um `points` aceito na borda voltaria a ser a segunda aritmética do sistema (R5).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POINTS_PER_TASK } from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const calls = {
    createTask: [] as any[],
    createTaskBacklog: [] as any[],
    updateTask: [] as any[],
    approveTask: [] as any[],
  };
  // `vi.hoisted` roda antes dos imports: o literal 10 é conferido contra a constante do
  // domínio no describe abaixo (`expect(POINTS_PER_TASK).toBe(10)`).
  const fakeTask = {
    id: 7,
    points: 10,
    toJSON: () => ({ id: 7, title: "tarefa", points: 10 }),
  };
  return { calls, fakeTask };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({
    taskManagement: {
      createTask: async (command: any) => {
        mocks.calls.createTask.push(command);
        return mocks.fakeTask;
      },
      createTaskBacklog: async (commands: any[]) => {
        mocks.calls.createTaskBacklog.push(commands);
        return [mocks.fakeTask];
      },
      updateTask: async (command: any) => {
        mocks.calls.updateTask.push(command);
        return mocks.fakeTask;
      },
      approveTask: async (command: any) => {
        mocks.calls.approveTask.push(command);
        return mocks.fakeTask;
      },
    },
  }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: { id: 42, roles: ["COORDENADOR"] } }),
  ensurePermission: () => null,
  ensureAnyRole: () => null,
  ensureSelfOrPermission: () => null,
}));

vi.mock("@/lib/auth/rbac", () => ({
  hasPermission: () => true,
}));

import { POST as tasksPost } from "@/app/api/tasks/route";
import { PUT as taskPut } from "@/app/api/tasks/[id]/route";
import { POST as taskApprove } from "@/app/api/tasks/[id]/approve/route";

function post(path: string, body: unknown) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mocks.calls.createTask.length = 0;
  mocks.calls.createTaskBacklog.length = 0;
  mocks.calls.updateTask.length = 0;
  mocks.calls.approveTask.length = 0;
});

describe("POST /api/tasks — criação não aceita points do cliente (DEC-30)", () => {
  it("o valor fixo da regra é mesmo 10", () => {
    expect(POINTS_PER_TASK).toBe(10);
  });

  it("ignora points: 9999 no corpo e o comando chega ao caso de uso sem o campo", async () => {
    const res = await tasksPost(
      post("/api/tasks", {
        title: "Comprar reagentes",
        priority: "high",
        points: 9999,
        creationMode: "individual",
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.calls.createTask).toHaveLength(1);
    expect(mocks.calls.createTask[0]).not.toHaveProperty("points");
  });

  it("bulk (importador de backlog) também ignora points", async () => {
    const res = await tasksPost(
      post("/api/tasks", {
        tasks: [{ title: "Uma", points: 50 }, { title: "Duas", points: 60 }],
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.calls.createTaskBacklog[0]).toHaveLength(2);
    for (const command of mocks.calls.createTaskBacklog[0]) {
      expect(command).not.toHaveProperty("points");
    }
  });
});

describe("PUT /api/tasks/[id] — edição não redefine pontuação (DEC-40)", () => {
  it("points sai de allowedFields: o título é atualizado, o valor não viaja", async () => {
    const res = await taskPut(
      new NextRequest(new URL("/api/tasks/7", "http://localhost:3000"), {
        method: "PUT",
        body: JSON.stringify({ title: "Comprar reagentes (revisto)", points: 7777 }),
      }),
      idContext("7"),
    );

    expect(res.status).toBe(200);
    const [command] = mocks.calls.updateTask;
    expect(command.data.title).toBe("Comprar reagentes (revisto)");
    expect(command.data).not.toHaveProperty("points");
  });
});

describe("POST /api/tasks/[id]/approve — o prêmio é do domínio", () => {
  it("ignora points do corpo e chama o caso de uso só com taskId e approverId", async () => {
    const res = await taskApprove(
      post("/api/tasks/7/approve", { points: 9999, approverId: 1, awardedPoints: 9999 }),
      idContext("7"),
    );

    expect(res.status).toBe(200);
    expect(mocks.calls.approveTask).toEqual([{ taskId: 7, approverId: 42 }]);
  });

  it("id inválido continua 400 antes de tocar o domínio", async () => {
    const res = await taskApprove(post("/api/tasks/abc/approve", { points: 9999 }), idContext("abc"));

    expect(res.status).toBe(400);
    expect(mocks.calls.approveTask).toHaveLength(0);
  });
});