// @vitest-environment node
/**
 * B6-2b (D4, DEC-53, DEC-54) — o gate de MANAGE_NOTIFICATIONS desceu de `POST /api/notifications`
 * para `PublishNotificationEventUseCase`. Este arquivo fixa o contrato HTTP desse movimento.
 *
 * Por que um arquivo novo, e não `notifications-routes.test.ts`: aquele dobra o módulo
 * (`notifications: mocks.fakeModule`) E o guard (`ensurePermission: () => mocks.auth.permissionError`),
 * então o 403 dele é o 403 do duplo — a rota decide, o teste não. Aqui o módulo é REAL sobre uma
 * porta falsa, a mesma forma de `badge-authorization.test.ts` e da reescrita do teste de
 * caraterização no B6-2a.
 *
 * Este arquivo foi escrito ANTES do movimento (regra da casa: em autorização, o teste vem
 * primeiro) e ele mediu três coisas que os testes antigos não diziam:
 *
 *  1. a ordem permissão → validação de rota. `POST /api/notifications` tem 400s DE ROTA com
 *     mensagens próprias ("Título e mensagem são obrigatórios", "Informe ao menos um
 *     destinatário") que são DIFERENTES das mensagens congeladas do use case ("Título é
 *     obrigatório", "Mensagem é obrigatória", "Nenhum destinatário informado"). Por isso as
 *     validações de rota NÃO podem descer para o use case, e por isso o gate também não pode
 *     descer sozinho: se descesse, quem não tem permissão com corpo inválido passaria a levar
 *     400 no lugar do 403. Ver o caso "403 vem ANTES das 400 de rota".
 *
 *  2. que `PublishNotificationEventUseCase` é chamado por TRÊS donos: a rota (com ator) e dois
 *     publishers internos de sistema (issue do laboratório, relatório enviado) que não têm
 *     ator nenhum. É o motivo do ator-de-sistema (DEC-54). Sem ele, o gate dentro do use case
 *     quebraria a notificação de issue e a de relatório.
 *
 *  3. que o 403 legado era `{error}` sem `code` — o mesmo corpo que o DEC-53 troca pelo
 *     superset `{error, code, details}`. Igual ao que aconteceu com badges e rewards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createNotificationsModule } from "@/backend/modules/notifications";
import type {
  CreateNotificationRow,
  NotificationRepository,
} from "@/backend/modules/notifications/application/ports/notification.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  rows: [] as CreateNotificationRow[],
}));

vi.mock("@/backend/composition/root", () => {
  // Porta falsa mínima: `POST` só exercita `createMany` e `listActiveUserIds`. O resto existe
  // porque `createNotificationsModule` constrói o módulo inteiro, mas os métodos de leitura
  // ficam vazios — nenhum é chamado por este arquivo.
  const repository: NotificationRepository = {
    async createMany(rows) {
      mocks.rows.push(...rows);
      return rows.length;
    },
    async listActiveUserIds() {
      return [1, 2, 3];
    },
    async listByUser() {
      return [];
    },
    async countUnread() {
      return 0;
    },
    async markRead() {
      return 0;
    },
    async markAllRead() {
      return 0;
    },
    async remove() {
      return 0;
    },
  };

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      notifications: createNotificationsModule({ repository }),
    }),
  };
});

// Só a sessão é dobrada: `requireApiActor` e `hasPermission` seguem sendo os de produção.
vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { POST } from "@/app/api/notifications/route";

/**
 * Quem tem MANAGE_NOTIFICATIONS, segundo a matriz real (`backend/domain/identity/permissions.ts`:
 * `MANAGE_NOTIFICATIONS: ["COORDENADOR", "GERENTE"]`). Cada papel é seu próprio array porque
 * `requireApiActor` normaliza com `normalizeRoles` — passar a string solta daria `[]` e negaria
 * todo mundo (o duplo de `floating-session-timer` já caiu nesse buraco uma vez).
 */
const MANAGER_ROLES = [["COORDENADOR"], ["GERENTE"]];
/** VOLUNTARIO não tem nenhuma permissão de gestão. */
const NO_MANAGEMENT_ROLES = ["VOLUNTARIO"];

function login(roles: string[], id = 42) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function logout() {
  mocks.session = null;
}

function request(body?: unknown) {
  return new NextRequest(new URL("/api/notifications", "http://localhost:3000"), {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const read = async (response: Response) => await response.json();
const VALID = { title: "Aviso", message: "Corpo", userId: 5 };

beforeEach(() => {
  mocks.session = null;
  mocks.rows = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/notifications — o gate de MANAGE_NOTIFICATIONS", () => {
  it("sem sessão devolve 401 antes de qualquer autorização", async () => {
    logout();
    const response = await POST(request(VALID));
    expect(response.status).toBe(401);
    expect(await read(response)).toEqual({ error: "Não autorizado" });
    expect(mocks.rows).toHaveLength(0);
  });

  it("COORDENADOR e GERENTE publicam (201); VOLUNTARIO leva 403 com a mensagem legada", async () => {
    for (const roles of MANAGER_ROLES) {
      login(roles);
      const response = await POST(request(VALID));
      expect(response.status).toBe(201);
      expect(await read(response)).toMatchObject({ success: true, createdCount: 1 });
    }
    expect(mocks.rows).toHaveLength(MANAGER_ROLES.length);

    login(NO_MANAGEMENT_ROLES);
    const denied = await POST(request(VALID));
    expect(denied.status).toBe(403);
    // A mensagem é a que a rota legacy passava ao `ensurePermission`. O `code` é o superset do
    // OND8-B4 (DEC-53) — antes do movimento o corpo era só `{error}`.
    expect(await read(denied)).toMatchObject({
      error: "Sem permissão para criar notificações",
      code: "FORBIDDEN",
    });
    // o 403 não escreveu nada
    expect(mocks.rows).toHaveLength(MANAGER_ROLES.length);
  });

  it("403 vem ANTES das 400 de rota: sem permissão, corpo inválido é 403 e não 400", async () => {
    // Esta é a razão de o gate não poder descer sozinho para `publishEvent`. As validações de
    // rota rodam antes da chamada ao use case, e as mensagens delas são diferentes das
    // congeladas do use case — se o gate descesse, um VOLUNTARIO com título vazio levaria 400
    // "Título e mensagem são obrigatórios" em vez do 403 que leva hoje.
    login(NO_MANAGEMENT_ROLES);
    for (const invalid of [
      { title: "", message: "" },
      { title: "Aviso", message: "Corpo", userIds: [] },
      {},
    ]) {
      const response = await POST(request(invalid));
      expect(response.status).toBe(403);
      expect(await read(response)).toMatchObject({ error: "Sem permissão para criar notificações" });
    }
    expect(mocks.rows).toHaveLength(0);
  });

  it("as 400 de rota continuam 400 para quem TEM a permissão, com as mensagens legadas", async () => {
    login(MANAGER_ROLES[0]);

    const noTitle = await POST(request({ title: "", message: "" }));
    expect(noTitle.status).toBe(400);
    // Sem `code`: este 400 continua sendo construído pela rota, que não conhece o mapper.
    expect(await read(noTitle)).toEqual({ error: "Título e mensagem são obrigatórios" });

    const noRecipient = await POST(request({ title: "Aviso", message: "Corpo", userIds: [] }));
    expect(noRecipient.status).toBe(400);
    expect(await read(noRecipient)).toEqual({ error: "Informe ao menos um destinatário" });

    expect(mocks.rows).toHaveLength(0);
  });

  it("sendToAll resolve a audiência pelo ActiveUserDirectory e publica para todos", async () => {
    login(MANAGER_ROLES[0]);
    const response = await POST(request({ title: "Aviso", message: "Corpo", sendToAll: true }));
    expect(response.status).toBe(201);
    expect(await read(response)).toMatchObject({ createdCount: 3 });
    expect(mocks.rows.map((row) => row.userId)).toEqual([1, 2, 3]);
  });

  it("o gate não quebrou o caminho feliz: título e mensagem são gravados verbatim", async () => {
    login(MANAGER_ROLES[1]);
    await POST(request({ title: "Aviso", message: "Corpo", userId: 5, data: { k: 1 } }));
    expect(mocks.rows).toEqual([
      { userId: 5, type: "SYSTEM_ANNOUNCEMENT", title: "Aviso", message: "Corpo", data: '{"k":1}' },
    ]);
  });
});