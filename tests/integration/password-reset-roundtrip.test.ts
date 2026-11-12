// @vitest-environment node
/**
 * plan-v24 S01 — G4 roundtrip da solicitação de troca de senha contra o banco de teste
 * isolado em 5433 (regra da casa: nunca a 5432). Prisma real, bcrypt real, wiring do
 * módulo sem mocks.
 *
 * O que este arquivo prova (CA1, CA2, CA3, CA6-GET do MODELO):
 *  - email existente: `requestPasswordReset` persiste linha `pending` com hash bcrypt ($2),
 *    a senha e o status da conta ficam intactos, e a saída não tem a senha;
 *  - email inexistente: `null`, nenhuma linha criada (ADR-002 — a resposta da rota é a
 *    mesma nos dois casos, provado no teste de rota);
 *  - `pending` repetido para o mesmo email: ConflictError (ADR-004, INV4);
 *  - listar: `MANAGE_USERS` vê, `VOLUNTARIO` recebe ForbiddenError com "Acesso negado."
 *    (ADR-003, CA6).
 *
 * Só as linhas criadas por este arquivo são apagadas no afterAll.
 */
import { afterAll, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, userActor } from "@/backend/domain";
import { prisma } from "@/lib/database/prisma";
import { createUserManagementModule } from "@/backend/modules/user-management";

const userModule = createUserManagementModule();
const managerActor = userActor(1, ["COORDENADOR"]);
const volunteerActor = userActor(2, ["VOLUNTARIO"]);
const uniqueEmail = `g4-reset-${Date.now()}@test.local`;
const missingEmail = `g4-reset-miss-${Date.now()}@test.local`;

let userId = 0;
const requestIds: number[] = [];

describe("G4 roundtrip — password reset request (isolated test DB)", () => {
  afterAll(async () => {
    // Ordem: a FK `resolvedBy` aponta para `users` com SetNull; apagar a solicitação antes
    // da pessoa deixa o `users.delete` sem dependência nesta família.
    if (requestIds.length > 0) {
      await prisma.password_reset_requests.deleteMany({ where: { id: { in: requestIds } } });
    }
    if (userId > 0) {
      await prisma.users.deleteMany({ where: { id: userId } });
    }
  });

  it("email existente cria solicitação pending com hash bcrypt; conta fica intacta", async () => {
    const created = (await userModule.registerUser({
      name: "G4 Reset User",
      email: uniqueEmail,
      password: "g4-old-pass123",
    })) as { id: number };
    userId = created.id;
    const accountBefore = await prisma.users.findUnique({ where: { id: userId } });
    expect(accountBefore?.password).toBeTruthy();

    const result = (await userModule.requestPasswordReset({
      email: `  ${uniqueEmail.toUpperCase()} `,
      password: "g4-new-pass456",
    })) as Record<string, unknown> | null;

    expect(result).not.toBeNull();
    const publicRow = result as Record<string, unknown>;
    expect(publicRow).not.toHaveProperty("password");
    expect(publicRow.status).toBe("pending");
    expect(publicRow.email).toBe(uniqueEmail);

    const row = await prisma.password_reset_requests.findUnique({
      where: { id: publicRow.id as number },
    });
    requestIds.push(publicRow.id as number);
    expect(row?.email).toBe(uniqueEmail);
    expect(row?.status).toBe("pending");
    expect(row?.password?.startsWith("$2")).toBe(true); // bcrypt real, não fake de teste
    expect(row?.password).not.toBe("g4-new-pass456");
    expect(row?.resolvedAt).toBeNull();
    expect(row?.resolvedBy).toBeNull();

    // INV3: nenhum caminho de reset escreve status nem senha da conta.
    const accountAfter = await prisma.users.findUnique({ where: { id: userId } });
    expect(accountAfter?.password).toBe(accountBefore?.password);
    expect(accountAfter?.status).toBe("pending");
  });

  it("email inexistente: null e nenhuma linha criada (resposta neutra, ADR-002)", async () => {
    const result = await userModule.requestPasswordReset({
      email: missingEmail,
      password: "g4-new-pass456",
    });
    expect(result).toBeNull();
    expect(await prisma.password_reset_requests.count({ where: { email: missingEmail } })).toBe(0);
  });

  it("segunda solicitação pendente para o mesmo email é recusada (INV4)", async () => {
    await expect(
      userModule.requestPasswordReset({ email: uniqueEmail, password: "g4-new-pass456" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      await prisma.password_reset_requests.count({ where: { email: uniqueEmail } }),
    ).toBe(1);
  });

  it("listar: gestor vê a solicitação sem a senha; voluntário é negado (CA6-GET)", async () => {
    const rows = (await userModule.listPasswordResetRequests(
      managerActor,
    )) as Array<Record<string, unknown>>;
    const mine = rows.find((row) => row.email === uniqueEmail);
    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty("password");
    expect(mine?.status).toBe("pending");

    await expect(userModule.listPasswordResetRequests(volunteerActor)).rejects.toThrow(
      "Acesso negado.",
    );
    await expect(userModule.listPasswordResetRequests(volunteerActor)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
