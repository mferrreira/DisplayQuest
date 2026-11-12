// @vitest-environment node
/**
 * plan-v24 S02 — G4 roundtrip da aprovação e rejeição da solicitação de troca de senha,
 * contra o banco de teste isolado em 5433. Prisma real, bcrypt real, wiring do módulo.
 *
 * O que este arquivo prova (CA4, CA5, CA7, INV3, INV5 do MODELO):
 *  - aprovar aplica a hash da solicitação em `users.password`: o login é o
 *    `bcrypt.compare` da rota de credenciais, e a mesma senha nova que o formulário enviou
 *    casa com a coluna da conta; `resolvedAt` e `resolvedBy` ficam na linha;
 *  - o status da conta não muda (conta `pending` aprovada no reset continua `pending`);
 *  - rejeitar marca `rejected` e a senha da conta fica intacta;
 *  - aprovar com a conta apagada: NotFoundError, a solicitação continua `pending`;
 *  - aprovar duas vezes: a segunda é recusada, nenhuma segunda escrita acontece;
 *  - gate: sem `MANAGE_USERS`, a resolução é negada com "Acesso negado." e nenhuma escrita.
 *
 * Só as linhas criadas por este arquivo são apagadas no afterAll.
 */
import { afterAll, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, userActor } from "@/backend/domain";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/database/prisma";
import { createUserManagementModule } from "@/backend/modules/user-management";

const userModule = createUserManagementModule();
const managerActor = userActor(1, ["COORDENADOR"]);
const volunteerActor = userActor(2, ["VOLUNTARIO"]);
const uniqueEmail = `g4-approve-${Date.now()}@test.local`;
const NEW_PASSWORD = "g4-new-pass456";

let userId = 0;
const requestIds: number[] = [];

describe("G4 roundtrip — aprovação e rejeição da solicitação de senha (isolated test DB)", () => {
  afterAll(async () => {
    if (requestIds.length > 0) {
      await prisma.password_reset_requests.deleteMany({ where: { id: { in: requestIds } } });
    }
    if (userId > 0) {
      await prisma.users.deleteMany({ where: { id: userId } });
    }
  });

  it("aprovar aplica a hash da solicitação na conta, sem mudar o status", async () => {
    const created = (await userModule.registerUser({
      name: "G4 Approve User",
      email: uniqueEmail,
      password: "g4-old-pass123",
    })) as { id: number };
    userId = created.id;
    const accountBefore = await prisma.users.findUnique({ where: { id: userId } });

    const request = (await userModule.requestPasswordReset({
      email: uniqueEmail,
      password: NEW_PASSWORD,
    })) as Record<string, unknown>;
    requestIds.push(request.id as number);

    const approved = (await userModule.resolvePasswordResetRequest(
      managerActor,
      request.id as number,
      "approve",
      new Date(),
    )) as Record<string, unknown>;

    expect(approved.status).toBe("approved");
    expect(approved).not.toHaveProperty("password");

    const row = await prisma.password_reset_requests.findUnique({
      where: { id: request.id as number },
    });
    expect(row?.resolvedAt).not.toBeNull();
    expect(row?.resolvedBy).toBe(1); // managerActor.id

    const accountAfter = await prisma.users.findUnique({ where: { id: userId } });
    expect(accountAfter?.password).not.toBe(accountBefore?.password);
    // CA4/CA8: a mesma régua da rota de credenciais — bcrypt.compare da senha nova.
    expect(await bcrypt.compare(NEW_PASSWORD, accountAfter?.password ?? "")).toBe(true);
    // INV3: nenhum caminho de reset toca o status da conta.
    expect(accountAfter?.status).toBe("pending");
  });

  it("aprovar duas vezes: a segunda é recusada, nenhuma segunda escrita", async () => {
    const rowId = requestIds[0];
    const passwordBefore = (await prisma.users.findUnique({ where: { id: userId } }))?.password;

    await expect(
      userModule.resolvePasswordResetRequest(managerActor, rowId, "approve", new Date()),
    ).rejects.toBeInstanceOf(ConflictError);

    expect((await prisma.users.findUnique({ where: { id: userId } }))?.password).toBe(
      passwordBefore,
    );
    expect((await prisma.password_reset_requests.findUnique({ where: { id: rowId } }))?.status)
      .toBe("approved");
  });

  it("rejeitar marca rejected e a senha da conta fica intacta", async () => {
    const second = (await userModule.registerUser({
      name: "G4 Reject User",
      email: `g4-reject-${Date.now()}@test.local`,
      password: "g4-old-pass123",
    })) as { id: number };
    const rejectEmail = `g4-reject-${Date.now()}@test.local`;
    // A conta acima já foi criada com o email gerado uma vez; cria a solicitação para o
    // mesmo usuário usando o email exato gravado.
    const createdRow = (await userModule.requestPasswordReset({
      email: (await prisma.users.findUnique({ where: { id: second.id } }))?.email,
      password: "g4-reject-new1",
    })) as Record<string, unknown>;
    requestIds.push(createdRow.id as number);

    const accountBefore = await prisma.users.findUnique({ where: { id: second.id } });
    const rejected = (await userModule.resolvePasswordResetRequest(
      managerActor,
      createdRow.id as number,
      "reject",
      new Date(),
    )) as Record<string, unknown>;

    expect(rejected.status).toBe("rejected");
    const accountAfter = await prisma.users.findUnique({ where: { id: second.id } });
    expect(accountAfter?.password).toBe(accountBefore?.password);

    const row = await prisma.password_reset_requests.findUnique({
      where: { id: createdRow.id as number },
    });
    expect(row?.status).toBe("rejected");
    expect(row?.resolvedBy).toBe(1);
    // Limpa a conta extra: tarefa nenhuma, só cadastro.
    await prisma.users.deleteMany({ where: { id: second.id } });
  });

  it("aprovar com a conta apagada: NotFoundError e a solicitação continua pending", async () => {
    const ghostEmail = `g4-ghost-${Date.now()}@test.local`;
    const ghost = (await userModule.registerUser({
      name: "G4 Ghost",
      email: ghostEmail,
      password: "g4-ghost-123",
    })) as { id: number };
    const row = (await userModule.requestPasswordReset({
      email: ghostEmail,
      password: "g4-ghost-new",
    })) as Record<string, unknown>;
    requestIds.push(row.id as number);

    // `users` sem dependências nesta família — delete direto no Prisma.
    await prisma.users.delete({ where: { id: ghost.id } });

    await expect(
      userModule.resolvePasswordResetRequest(managerActor, row.id as number, "approve", new Date()),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(
      (await prisma.password_reset_requests.findUnique({ where: { id: row.id as number } }))?.status,
    ).toBe("pending");
  });

  it("sem MANAGE_USERS, resolver é negado com a frase congelada e nenhuma escrita acontece", async () => {
    const row = (await userModule.requestPasswordReset({
      email: uniqueEmail,
      password: "g4-again-new",
    })) as Record<string, unknown>;
    requestIds.push(row.id as number);

    await expect(
      userModule.resolvePasswordResetRequest(volunteerActor, row.id as number, "approve", new Date()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      userModule.resolvePasswordResetRequest(volunteerActor, row.id as number, "approve", new Date()),
    ).rejects.toThrow("Acesso negado.");

    expect(
      (await prisma.password_reset_requests.findUnique({ where: { id: row.id as number } }))?.status,
    ).toBe("pending");
  });
});
