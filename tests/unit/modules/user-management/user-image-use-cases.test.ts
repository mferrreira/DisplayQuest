/**
 * V5-3 (DEC-137) — os use cases da imagem de perfil, sobre o MÓDULO REAL montado sobre porta falsa.
 *
 * O arquivo de rotas (`tests/unit/api/user-image-routes.test.ts`) já prova a ordem HTTP. Este aqui
 * fixa a autoridade na camada onde ela mora (D4: "o gate decide nos use cases"): a negação com a
 * mensagem própria do perfil, o `previousKey` que permite à rota apagar o objeto velho, e o fato de
 * o assert existir SEM ler o usuário — é o que faz o 403 poder vir antes do corpo do upload.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  ForbiddenError,
  NotFoundError,
  PROFILE_DENIED_MESSAGE,
  emptyPersonData,
  userActor,
} from "@/backend/domain";
import { AssertCanUpdateUserImageUseCase } from "@/backend/modules/user-management/application/use-cases/assert-can-update-user-image.use-case";
import { GetUserImageUseCase } from "@/backend/modules/user-management/application/use-cases/get-user-image.use-case";
import { UpdateUserImageUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-image.use-case";
import type { UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";

const owner = userActor(1, ["VOLUNTARIO"]); // dono do id 1
const stranger = userActor(99, ["VOLUNTARIO"]); // sem gestao, id fora do store
const manager = userActor(999, ["COORDENADOR"]); // MANAGE_USERS, id fora do store

function userRow(id: number, bannerKey: string | null = null): UserRecord {
  return {
    id,
    name: `Pessoa ${id}`,
    email: `pessoa${id}@lab.com`,
    points: 0,
    completedTasks: 0,
    password: "hashed",
    status: "active",
    weekHours: 0,
    currentWeekHours: 0,
    profileVisibility: "public",
    bio: null,
    avatar: null,
    bannerKey,
    ...emptyPersonData(),
    roles: ["VOLUNTARIO"],
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
  };
}

function makeFixture(initial: UserRecord[] = [userRow(1)]) {
  const store = new Map(initial.map((row) => [row.id, row]));
  const reads: number[] = [];
  const writes: Array<{ id: number; bannerKey: string | null }> = [];

  // `as never` na porta parcial (padrão da casa): só os métodos exercitados existem, e o que não
  // deveria ser chamado não é. Os parâmetros são tipados à mão porque o cast tira o contexto.
  const repository = {
    // Cópia na leitura: o use case muta o record antes de gravar, e um record vivo do Map faria a
    // falha do `update` parecer sucesso.
    async findById(id: number) {
      reads.push(id);
      const row = store.get(id);
      return row ? { ...row } : null;
    },
    async update(record: UserRecord) {
      writes.push({ id: record.id, bannerKey: record.bannerKey });
      store.set(record.id, record);
      return record;
    },
  } as never;

  return {
    repository,
    reads,
    writes,
    bannerKeyOf: (id: number) => store.get(id)?.bannerKey ?? null,
  };
}

describe("UpdateUserImageUseCase — gate e chave anterior", () => {
  let fx: ReturnType<typeof makeFixture>;

  beforeEach(() => {
    fx = makeFixture();
  });

  it("a própria pessoa escreve a capa e a coluna guarda a chave", async () => {
    const result = await new UpdateUserImageUseCase(fx.repository).execute({
      actor: owner,
      userId: 1,
      slot: "banner",
      blobKey: "users/1/images/banner/abc.png",
    });

    expect(result.previousKey).toBeNull();
    expect(result.user.bannerKey).toBe("users/1/images/banner/abc.png");
    expect(fx.bannerKeyOf(1)).toBe("users/1/images/banner/abc.png");
    // `password` nunca sai: a projeção é a mesma do perfil (toPublicUser).
    expect(result.user).not.toHaveProperty("password");
  });

  it("OUTRA pessoa sem gestão: 403 com a mensagem própria do perfil, e nada é escrito", async () => {
    await expect(
      new UpdateUserImageUseCase(fx.repository).execute({
        actor: stranger,
        userId: 1,
        slot: "banner",
        blobKey: "users/1/images/banner/abc.png",
      }),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      new UpdateUserImageUseCase(fx.repository).execute({
        actor: stranger,
        userId: 1,
        slot: "banner",
        blobKey: "users/1/images/banner/abc.png",
      }),
    ).rejects.toThrow(PROFILE_DENIED_MESSAGE);

    expect(fx.writes).toEqual([]);
    expect(fx.bannerKeyOf(1)).toBeNull();
  });

  it("MANAGE_USERS escreve a capa de outra pessoa (é o gate do perfil, medido em B6-4)", async () => {
    const result = await new UpdateUserImageUseCase(fx.repository).execute({
      actor: manager,
      userId: 1,
      slot: "banner",
      blobKey: "users/1/images/banner/abc.png",
    });
    expect(result.user.bannerKey).toBe("users/1/images/banner/abc.png");
  });

  it("trocar devolve a chave ANTERIOR, que é o que a rota remove depois", async () => {
    const useCase = new UpdateUserImageUseCase(fx.repository);
    await useCase.execute({ actor: owner, userId: 1, slot: "banner", blobKey: "velha.png" });
    const second = await useCase.execute({ actor: owner, userId: 1, slot: "banner", blobKey: "nova.png" });

    expect(second.previousKey).toBe("velha.png");
    expect(fx.bannerKeyOf(1)).toBe("nova.png");
  });

  it("`blobKey: null` é o tirar: a coluna volta a vazio", async () => {
    const useCase = new UpdateUserImageUseCase(fx.repository);
    await useCase.execute({ actor: owner, userId: 1, slot: "banner", blobKey: "users/1/images/banner/abc.png" });

    const result = await useCase.execute({ actor: owner, userId: 1, slot: "banner", blobKey: null });

    expect(result.previousKey).toBe("users/1/images/banner/abc.png");
    expect(result.user.bannerKey).toBeNull();
    expect(fx.bannerKeyOf(1)).toBeNull();
  });

  it("usuário ausente: 404 'Usuário não encontrado' — depois do gate", async () => {
    // O ator é o DONO do id que não existe: é assim que o gate (self OU MANAGE_USERS) deixa passar
    // até o lookup. Quem não pode nem chega ao lookup.
    const missingOwner = userActor(404, ["VOLUNTARIO"]);

    await expect(
      new UpdateUserImageUseCase(fx.repository).execute({
        actor: missingOwner,
        userId: 404,
        slot: "banner",
        blobKey: "x.png",
      }),
    ).rejects.toThrow(NotFoundError);

    // Para quem não pode, a negação vem ANTES do lookup — ausente PARA quem não pode é 403, não 404
    // (a ordem medida do delete, B6-4).
    await expect(
      new UpdateUserImageUseCase(fx.repository).execute({
        actor: stranger,
        userId: 404,
        slot: "banner",
        blobKey: "x.png",
      }),
    ).rejects.toThrow(PROFILE_DENIED_MESSAGE);
    expect(fx.reads).toEqual([404]);
  });
});

describe("AssertCanUpdateUserImageUseCase — o gate que pode rodar antes do corpo", () => {
  it("nega sem ler o usuário: o assert não toca o repositório", () => {
    const fx = makeFixture();
    expect(() =>
      new AssertCanUpdateUserImageUseCase().execute({ actor: stranger, userId: 1 }),
    ).toThrow(PROFILE_DENIED_MESSAGE);
    expect(fx.reads).toEqual([]);
  });

  it("deixa passar a própria pessoa e quem gerencia", () => {
    const assert = new AssertCanUpdateUserImageUseCase();
    expect(() => assert.execute({ actor: owner, userId: 1 })).not.toThrow();
    expect(() => assert.execute({ actor: manager, userId: 1 })).not.toThrow();
  });
});

describe("GetUserImageUseCase — leitura do autenticado", () => {
  it("qualquer autenticado lê a chave: não há gate de leitura aqui (DEC-127/136)", async () => {
    const fx = makeFixture([userRow(1, "users/1/images/banner/abc.png")]);
    const result = await new GetUserImageUseCase(fx.repository).execute({
      actor: stranger,
      userId: 1,
      slot: "banner",
    });
    expect(result).toEqual({ slot: "banner", blobKey: "users/1/images/banner/abc.png" });
  });

  it("slot sem capa: 404 'Imagem não encontrada'", async () => {
    const fx = makeFixture();
    await expect(
      new GetUserImageUseCase(fx.repository).execute({ actor: owner, userId: 1, slot: "banner" }),
    ).rejects.toThrow("Imagem não encontrada");
  });

  it("usuário ausente: 404 'Usuário não encontrado'", async () => {
    const fx = makeFixture();
    await expect(
      new GetUserImageUseCase(fx.repository).execute({ actor: owner, userId: 404, slot: "banner" }),
    ).rejects.toThrow("Usuário não encontrado");
  });
});
