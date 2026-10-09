// @vitest-environment node
/**
 * V4-1 (DEC-55) — excluir usuário não pode depender do banco decidir.
 *
 * Medido antes de escrever este arquivo, na base de teste, com o caminho real
 * (`DeleteUserUseCase` → Prisma real):
 *
 *   user 58 (Coordenador): compras 2, logs 1, relatórios 3, sessões 2
 *     -> P2003 — projects_createdBy_fkey
 *   user 59 (Gerente):     tasks 2, responsabilidades 1, relatórios 2
 *     -> P2003 — lab_responsibilities_userId_fkey
 *
 * A causa é estrutural: 16 das 23 FKs que apontam para `users` são RESTRICT (default do Prisma,
 * sem `onDelete`). Então `DELETE /api/users/[id]` falha para qualquer usuário que tenha feito
 * alguma coisa — e a rota devolvia 500 com a mensagem CRUA do Prisma no corpo, incluindo o bloco
 * `Invalid prisma.users.delete() invocation`, porque `domainErrorResponse` devolve `null` para
 * não-DomainError e o `catch` faz `error.message || ...`.
 *
 * O dono decidiu inativar em vez de excluir (DEC-55). O caminho que inativa é `suspended` — o
 * status `inactive` não existe como estado escrevível (medido no V4-4c: o enum é
 * pending/active/rejected/suspended em `entities/user.ts:31`, a rota escreve
 * active/rejected/suspended, e o único `inactive` do backend era um contador que sempre dava zero;
 * DEC-95 removeu o contador e a opção "Inativo" do painel). O que bloqueia é qualquer status
 * `!== "active"`: login (`lib/auth/config.ts:30`), API (`lib/auth/server-auth.ts:36`), regras de
 * laboratório, relatórios em lote e reset semanal do cron. Nada disso é criado aqui. O que este
 * lote muda é só a recusa: `ConflictError` (409) com mensagem legível quando há dependência, em
 * vez de deixar o banco estourar.
 *
 * O caso que já funcionava continua funcionando: um cadastro sem histórico algum (o usuário de
 * teste recém-registrado) é excluído de verdade. Isso é o que separa esta decisão de "remover o
 * endpoint".
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, userActor } from "@/backend/domain";

/** B6-4 (D4): DeleteUserUseCase exige ator MANAGE_USERS puro; este arquivo exercita a recusa por dependencia. */
const managerActor = userActor(1, ["COORDENADOR"]);
import { DeleteUserUseCase } from "@/backend/modules/user-management/application/use-cases/delete-user.use-case";
import type { UserRepositoryPort, UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";

/**
 * Dupla mínima com o campo que a recusa precisa: quantas linhas de outros registros ainda
 * apontam para o usuário. `dependents` é um Map porque "0 ou não" não basta — o teste precisa
 * distinguir usuário limpo de usuário com histórico, e o número aparece na mensagem.
 */
class FakeRepository implements Pick<UserRepositoryPort, "findById" | "delete" | "countBlockingDependencies"> {
  store: UserRecord[] = [];
  dependents = new Map<number, number>();
  deleteCalls: number[] = [];

  async findById(id: number) {
    return this.store.find((u) => u.id === id) ?? null;
  }
  async delete(id: number) {
    this.deleteCalls.push(id);
    this.store = this.store.filter((u) => u.id !== id);
  }
  async countBlockingDependencies(userId: number) {
    return this.dependents.get(userId) ?? 0;
  }
}

function user(id: number) {
  return {
    id,
    name: `Usuário ${id}`,
    email: `u${id}@x.com`,
    password: "bcrypt:x",
    status: "active",
    points: 10,
    completedTasks: 0,
    weekHours: 0,
    currentWeekHours: 0,
    roles: ["VOLUNTARIO"],
    avatar: null,
    bio: null,
    profileVisibility: "public",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as UserRecord;
}

let repository: FakeRepository;

beforeEach(() => {
  repository = new FakeRepository();
  repository.store = [user(4), user(5)];
  repository.dependents = new Map([[4, 0], [5, 7]]);
});

describe("DeleteUserUseCase — a recusa antes do banco (DEC-55)", () => {
  it("usuário inexistente continua NotFoundError (404) — a ordem não mudou", async () => {
    const error = await new DeleteUserUseCase(repository as unknown as UserRepositoryPort)
      .execute(managerActor, 99)
      .catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ status: 404, message: "Usuário não encontrado" });
    expect(repository.deleteCalls).toEqual([]);
  });

  it("usuário SEM dependência é excluído de verdade (o caso que já funcionava)", async () => {
    await new DeleteUserUseCase(repository as unknown as UserRepositoryPort).execute(managerActor, 4);
    expect(repository.deleteCalls).toEqual([4]);
    expect(repository.store.find((u) => u.id === 4)).toBeUndefined();
  });

  it("usuário COM dependência leva ConflictError (409) e o delete NUNCA é chamado", async () => {
    const error = await new DeleteUserUseCase(repository as unknown as UserRepositoryPort)
      .execute(managerActor, 5)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ status: 409 });
    // O ponto inteiro do lote: o Prisma não chega a ser consultado, então P2003 não existe e a
    // mensagem crua dele não chega ao cliente.
    expect(repository.deleteCalls).toEqual([]);
    expect(repository.store.find((u) => u.id === 5)).toBeDefined();
  });

  it("a mensagem explica o que fazer no lugar, sem expor tabela nem constraint", async () => {
    const error = await new DeleteUserUseCase(repository as unknown as UserRepositoryPort)
      .execute(managerActor, 5)
      .catch((e) => e);
    // A mensagem oferece o caminho no lugar da recusa seca. Comparado em minúsculas porque a
    // frase começa a frase mesmo: "Inative o usuário...".
    expect(error.message.toLowerCase()).toContain("inative");
    // Nada de vocabulário de persistência no corpo que o cliente vê.
    for (const leak of ["prisma", "foreign key", "constraint", "p2003", "fkey"]) {
      expect(error.message.toLowerCase()).not.toContain(leak);
    }
  });

  it("a checagem vem ANTES do delete, não depois: um 409 nunca deixa metade excluída", async () => {
    // Se a recusa dependesse de capturar o erro do Prisma, o `delete` já teria rodado.
    const order: string[] = [];
    const traced = {
      findById: async (id: number) => {
        order.push("findById");
        return repository.findById(id);
      },
      delete: async (id: number) => {
        order.push("delete");
        repository.deleteCalls.push(id);
      },
      countBlockingDependencies: async (id: number) => {
        order.push("count");
        return repository.countBlockingDependencies(id);
      },
    } as unknown as UserRepositoryPort;

    await new DeleteUserUseCase(traced).execute(managerActor, 5).catch(() => undefined);
    // `delete` não aparece na lista: a recusa aconteceu antes de qualquer tentativa de apagar.
    expect(order).toEqual(["findById", "count"]);
  });
});
