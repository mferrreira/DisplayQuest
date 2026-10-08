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
 *  - `POST /api/tasks/[id]/approve` nunca lê o corpo: o prêmio é decidido no domínio;
 *  - OND4-A: aprovação e conclusão **repassam** `awardedTo`/`awardedPoints` do caso de uso,
 *    sem recalcular, sem piso e sem trocar `null` por 0 — é o número do servidor que a
 *    animação da Onda 4.B mostra, e por isso ele não pode ser reescrito na borda.
 *
 * Sem isto, um `points` aceito na borda voltaria a ser a segunda aritmética do sistema (R5).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POINTS_PER_TASK, filterTaskEditFields, requireActorPermission } from "@/backend/domain";

const mocks = vi.hoisted(() => {
  const calls = {
    createTask: [] as any[],
    createTaskBacklog: [] as any[],
    updateTask: [] as any[],
    approveTask: [] as any[],
    completeTask: [] as any[],
  };
  // `vi.hoisted` roda antes dos imports: o literal 10 é conferido contra a constante do
  // domínio no describe abaixo (`expect(POINTS_PER_TASK).toBe(10)`).
  const fakeTask = {
    id: 7,
    points: 10,
    toJSON: () => ({ id: 7, title: "tarefa", points: 10 }),
  };
  // plan-v3 OND4-A: os casos de uso devolvem `{ task, awardedTo, awardedPoints }`. O par é
  // mutável porque o que interessa aqui é a borda: a rota repassa o número do servidor sem
  // recalcular, sem piso e sem trocar `null` por 0.
  const award = { awardedTo: 7 as number | null, awardedPoints: 15 as number | null };
  return { calls, fakeTask, award };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({
    taskManagement: {
      // B6-7 (D4): o assert antes do parse e o filtro de campos sao do dominio — o duplo
      // aplica as MESMAS funcoes (molde DEC-90) em vez de reimplementar a regra.
      assertCanManageTasks: ({ actor }: any) =>
        requireActorPermission(actor, "MANAGE_TASKS", "Sem permissão para criar tarefa"),
      createTask: async (command: any) => {
        mocks.calls.createTask.push(command);
        return mocks.fakeTask;
      },
      createTaskBacklog: async (commands: any[]) => {
        mocks.calls.createTaskBacklog.push(commands);
        return [mocks.fakeTask];
      },
      updateTask: async (command: any) => {
        // o use case real recebe o corpo CRU (o gate de campo decide sobre ele) e filtra com
        // filterTaskEditFields antes de mutar — o duplo captura o que o use case mutaria
        mocks.calls.updateTask.push({ ...command, data: filterTaskEditFields(command.data) });
        return mocks.fakeTask;
      },
      approveTask: async (command: any) => {
        mocks.calls.approveTask.push(command);
        return { task: mocks.fakeTask, ...mocks.award };
      },
      completeTask: async (command: any) => {
        mocks.calls.completeTask.push(command);
        return { task: mocks.fakeTask, ...mocks.award };
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
import { PUT as taskPut, PATCH as taskPatch } from "@/app/api/tasks/[id]/route";
import { POST as taskApprove } from "@/app/api/tasks/[id]/approve/route";

function post(path: string, body: unknown) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: "PATCH",
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
  mocks.calls.completeTask.length = 0;
  // Padrão do describe novo: aprovação creditou 15 pontos ao responsável 7.
  mocks.award.awardedTo = 7;
  mocks.award.awardedPoints = 15;
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
    // B6-7: o filtro allowedFields saiu da rota e virou filterTaskEditFields (dominio,
    // aplicado pelo use case). "points" continua fora da lista (DEC-40) — agora provado pela
    // funcao do dominio que o duplo aplica, nao por uma lista local da rota.
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

/**
 * plan-v3 OND4-A (AC-P3-08) — a borda devolve o prêmio **creditado**, e devolve como veio.
 *
 * Três casos que a interface da Onda 4.B distingue, e que um `|| 0` ou um clamp apagaria:
 *   - `awardedPoints: 15` com `awardedTo: 7` — creditou outra pessoa (é o caso comum: a
 *     aprovação credita o responsável, quase nunca quem aprovou);
 *   - `awardedPoints: 0` com `awardedTo` preenchido — o award já existia: houve tentativa, e
 *     nada mudou. Não é `null`;
 *   - `null` nos dois — ninguém foi creditado (tarefa sem responsável, ou o caminho sem award).
 */
describe("POST /api/tasks/[id]/approve — a resposta carrega o prêmio creditado (OND4-A)", () => {
  it("repassa awardedPoints e awardedTo como o caso de uso devolveu", async () => {
    const res = await taskApprove(post("/api/tasks/7/approve", {}), idContext("7"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.awardedPoints).toBe(15);
    expect(body.awardedTo).toBe(7);
    expect(body.task).toEqual({ id: 7, title: "tarefa", points: 10 });
  });

  it("0 com awardedTo preenchido continua 0 — 'já constava' não vira null", async () => {
    mocks.award.awardedPoints = 0;

    const body = await (await taskApprove(post("/api/tasks/7/approve", {}), idContext("7"))).json();

    expect(body.awardedTo).toBe(7);
    expect(body.awardedPoints).toBe(0);
  });

  it("null nos dois quando ninguém foi creditado", async () => {
    mocks.award.awardedTo = null;
    mocks.award.awardedPoints = null;

    const body = await (await taskApprove(post("/api/tasks/7/approve", {}), idContext("7"))).json();

    expect(body.awardedTo).toBeNull();
    expect(body.awardedPoints).toBeNull();
  });

  it("prêmio negativo chega negativo: penalidade de atraso não tem piso (DEC-39)", async () => {
    mocks.award.awardedPoints = -20;

    const body = await (await taskApprove(post("/api/tasks/7/approve", {}), idContext("7"))).json();

    expect(body.awardedPoints).toBe(-20);
  });
});

describe("PATCH /api/tasks/[id] (complete) — a conclusão também devolve o prêmio creditado", () => {
  it("credita quem concluiu (o ator, id 42) e devolve o valor do servidor", async () => {
    mocks.award.awardedTo = 42;
    mocks.award.awardedPoints = 10;

    const res = await taskPatch(patch("/api/tasks/7", { action: "complete" }), idContext("7"));

    expect(res.status).toBe(200);
    // B6-7 (D4): o comando carrega ActorRef; sem `userId` no corpo a rota nao envia o campo
    // e o default "premiado = o proprio ator" passou para dentro do CompleteTaskUseCase.
    expect(mocks.calls.completeTask).toEqual([
      { actor: { kind: "user", id: 42, roles: ["COORDENADOR"] }, taskId: 7 },
    ]);
    const body = await res.json();
    expect(body.awardedTo).toBe(42);
    expect(body.awardedPoints).toBe(10);
  });

  it("tarefa delegada vai para revisão sem creditar ninguém: null, não 0", async () => {
    mocks.award.awardedTo = null;
    mocks.award.awardedPoints = null;

    const body = await (await taskPatch(patch("/api/tasks/7", { action: "complete" }), idContext("7"))).json();

    expect(body.awardedTo).toBeNull();
    expect(body.awardedPoints).toBeNull();
  });
});