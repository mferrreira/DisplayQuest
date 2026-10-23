// @vitest-environment node
/**
 * plan-v8 V8-6 (DEC-217/218) — o contrato HTTP do equipar/desequipar troféu.
 *
 * congelo aqui, e só isto: a ORDEM da rota (autenticação → `id` da pessoa → gate → entrada do
 * troféu → escrita), as frases congeladas em cada recusa, e o shape do sucesso. O que decide fica no
 * use case e na regra pura (`trophy-equip-rules.test.ts`, `elo-rules.test.ts`); o estado gravado e a
 * linha de auditoria são do roundtrip (`gamification-roundtrip.test.ts`, contra o banco na 5433).
 *
 * Por que a ordem importa e é testada:
 *   - o `id` da pessoa é a única validação que a rota faz antes do gate porque é sobre ele que "self"
 *     decide (rota fina, D4/DEC-115..123);
 *   - quem NÃO é a pessoa ouve 403 ANTES de qualquer leitura do troféu — a mesma disciplina da
 *     DEC-189 ("subtasks: []" em vez de 403 que confirma que a lista existe): um 400/404 vindo antes
 *     do gate denunciaria ao estranho que a conquista existe;
 *   - `action` e `badgeId` são validados no use case DEPOIS do gate (precedente medido do
 *     `UpdateBadgeUseCase`, B6-2a).
 *
 * Módulo REAL sobre portas falsas, não duplo de módulo (a lição medida do B6-2a: duplo de módulo faz
 * a recusa SUMIR do teste em vez de falhar). A fake do equip reproduz a MESMA conta do adaptador
 * (`canEquipWithinSlots` do domínio aplicada sobre a contagem lida) — reimplementar a régua aqui é o
 * modo de falha da DEC-90.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { TROPHY_EQUIP_DENIED_MESSAGE, TROPHY_NOT_EARNED_MESSAGE, canEquipWithinSlots } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import type { BadgeCatalogPort } from "@/backend/modules/gamification/application/ports/badge-catalog.port";
import type { GamificationUsersPort } from "@/backend/modules/gamification/application/ports/gamification-users.port";
import type { TrophyEquipPort, TrophyEquipWrite } from "@/backend/modules/gamification/application/ports/trophy-equip.port";
import type { UserBadgePort } from "@/backend/modules/gamification/application/ports/user-badge.port";

const SELF_ID = 2;
const OTHER_ID = 3;

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  /** XP por pessoa: é dele que a escada lê o teto de slot (DEC-217). */
  xp: new Map<number, number>(),
  /** `{ userId, badgeId, equipped }` — a conquista e o estado do equip. */
  owned: [] as Array<{ id: number; userId: number; badgeId: number; equipped: boolean }>,
  /** O que chegou à port: prova que um 403/400/404 não escreveu nada. */
  writes: [] as Array<{ userId: number; badgeId: number; action: string; slots: number; elo: string; description: string }>,
  seedVersion: 0,
  /**
   * A store do mock é semeada na PRIMEIRA port chamada (o factory do mock é lazy). Escrever XP por
   * fora disso é escrever num Map que a próxima chamada vai substituir — por isso o ajuste de XP entra
   * pela porta do mock, depois de semear. Atribuída dentro do `vi.mock` abaixo.
   */
  setXp: null as null | ((userId: number, xp: number) => void),
}));

vi.mock("@/backend/composition/root", () => {
  const boom = (name: string) => async () => {
    throw new Error(`porta de gamification não deveria ser usada neste teste: ${name}`);
  };

  const reseed = () => {
    mocks.xp = new Map<number, number>([[SELF_ID, 400], [OTHER_ID, 900]]);
    mocks.owned = [
      { id: 1, userId: SELF_ID, badgeId: 10, equipped: false },
      { id: 2, userId: SELF_ID, badgeId: 11, equipped: false },
      { id: 3, userId: OTHER_ID, badgeId: 10, equipped: false },
    ];
    mocks.writes = [];
  };
  let seededVersion = -1;
  const fresh = () => {
    if (seededVersion !== mocks.seedVersion) {
      seededVersion = mocks.seedVersion;
      reseed();
    }
    return mocks;
  };

  const users: GamificationUsersPort = {
    async findProgressionById(userId) {
      const xp = fresh().xp.get(userId);
      if (xp === undefined) return null;
      return { id: userId, points: 0, xp, coins: 0 };
    },
    findUserById: boom("users.findUserById"),
    findAllUsers: boom("users.findAllUsers"),
  };

  const userBadges: UserBadgePort = {
    findByUserId: boom("userBadges.findByUserId"),
    findRecentByUserId: boom("userBadges.findRecentByUserId"),
    findByUserAndBadge: boom("userBadges.findByUserAndBadge"),
    create: boom("userBadges.create"),
    delete: boom("userBadges.delete"),
    countEquipped: boom("userBadges.countEquipped"),
    findEquippedEffectsByUserId: boom("userBadges.findEquippedEffectsByUserId"),
    setEquipped: boom("userBadges.setEquipped"),
  };

  const badges: BadgeCatalogPort = {
    findById: boom("badges.findById"),
    findAll: boom("badges.findAll"),
    findActive: boom("badges.findActive"),
    findByCategory: boom("badges.findByCategory"),
    create: boom("badges.create"),
    update: boom("badges.update"),
    delete: boom("badges.delete"),
  };

  /**
   * O estado do troféu na fake, com a MESMA conta do adaptador: a contagem é lida e a trava é
   * `canEquipWithinSlots(contagem lida, slots)`. O adaptador verdadeiro faz isso dentro do
   * `$transaction`; aqui a corrida de dois cliques não é o que se testa (é o roundtrip).
   */
  mocks.setXp = (userId: number, xp: number) => {
    fresh().xp.set(userId, xp);
  };

  const equip: TrophyEquipPort = {
    async applyEquip(write: TrophyEquipWrite) {
      const state = fresh();
      state.writes.push({ ...write });
      const earned = state.owned.find((row) => row.userId === write.userId && row.badgeId === write.badgeId);
      if (!earned) return { status: "not-earned", equippedBefore: 0, equippedAfter: 0 };

      const equippedBefore = state.owned.filter((row) => row.userId === write.userId && row.equipped).length;

      if (write.action === "equip") {
        if (earned.equipped) return { status: "unchanged", equippedBefore, equippedAfter: equippedBefore };
        if (!canEquipWithinSlots(equippedBefore, write.slots)) {
          return { status: "slot-full", equippedBefore, equippedAfter: equippedBefore };
        }
        earned.equipped = true;
        return { status: "applied", equippedBefore, equippedAfter: equippedBefore + 1 };
      }

      if (!earned.equipped) return { status: "unchanged", equippedBefore, equippedAfter: equippedBefore };
      earned.equipped = false;
      return { status: "applied", equippedBefore, equippedAfter: equippedBefore - 1 };
    },
  };

  const realGamification = createGamificationModule({
    ports: { badges, userBadges, users, awardHistory: boom as never, stats: boom as never, trophyEquip: equip },
  });

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      gamification: realGamification,
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { PATCH } from "@/app/api/users/[id]/trophies/route";

/** Array porque `requireApiActor` normaliza com `normalizeRoles`: string solta vira `[]` (B6-2a). */
function login(roles: string[], id = SELF_ID) {
  mocks.session = { id, email: `pessoa-${id}@lab.com`, name: `Pessoa ${id}`, roles, status: "active" };
}

function patch(userId: number | string, body: unknown) {
  return PATCH(
    new NextRequest(new URL(`/api/users/${userId}/trophies`, "http://localhost:3000"), {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(userId) }) },
  );
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.seedVersion += 1;
  login(["VOLUNTARIO"]);
});

describe("PATCH /api/users/[id]/trophies — a ordem da rota (rota fina, D4)", () => {
  it("sem sessão é 401 antes de tudo", async () => {
    mocks.session = null;
    const response = await patch(SELF_ID, { badgeId: 10, action: "equip" });
    expect(response.status).toBe(401);
    expect(mocks.writes).toHaveLength(0);
  });

  it("o `id` da pessoa é a única validação da rota antes do gate: id forjado é 400 sem tocar o troféu", async () => {
    for (const id of ["abc", "-3", "0", "1.5", ""]) {
      const response = await patch(id, { badgeId: 10, action: "equip" });
      expect(response.status).toBe(400);
      expect((await read(response)).error).toBe("Usuário inválido");
    }
    expect(mocks.writes).toHaveLength(0);
  });

  it("gestão com MANAGE_USERS não equipar troféu de outra pessoa, e o 403 vem antes de ler o troféu", async () => {
    // `OTHER_ID` tem o troféu 10 conquistado (seed). Quem não é a pessoa não recebe 404/400/409: o
    // gate decide primeiro, para não confirmar ao estranho que a conquista existe (DEC-189).
    login(["COORDENADOR"], 99);
    const response = await patch(OTHER_ID, { badgeId: 10, action: "equip" });
    expect(response.status).toBe(403);
    expect((await read(response)).error).toBe(TROPHY_EQUIP_DENIED_MESSAGE);
    // A prova de que NENHUMA leitura de troféu aconteceu é mais forte do que parece: a store do mock só
    // é semeada quando uma port é chamada, e `writes` vazio diz que nenhuma foi.
    expect(mocks.writes).toHaveLength(0);
  });

  it("`action` e `badgeId` são validados depois do gate (precedente do UpdateBadgeUseCase, B6-2a)", async () => {
    // Mesmo corpo inválido: para quem é a pessoa, denuncia a entrada; para quem não é, denuncia o gate.
    login(["COORDENADOR"], 99);
    const denied = await patch(OTHER_ID, { badgeId: "x", action: "bogus" });
    expect(denied.status).toBe(403);
    expect((await read(denied)).error).toBe(TROPHY_EQUIP_DENIED_MESSAGE);

    login(["VOLUNTARIO"]);
    const badAction = await patch(SELF_ID, { badgeId: 10, action: "wear" });
    expect(badAction.status).toBe(400);
    expect((await read(badAction)).error).toBe("Ação inválida");

    const badBadge = await patch(SELF_ID, { badgeId: "x", action: "equip" });
    expect(badBadge.status).toBe(400);
    expect((await read(badBadge)).error).toBe("Badge inválido");

    const noBody = await patch(SELF_ID, {});
    expect(noBody.status).toBe(400);
    expect(mocks.writes).toHaveLength(0);
  });
});

describe("PATCH /api/users/[id]/trophies — o slot é o do elo do momento (DEC-217)", () => {
  it("em BRONZE (XP 0), equipar responde 409 nomeando o elo e o limite — não 400", async () => {
    // O pedido não está mal formado: a pessoa tem o troféu. O que falta é degrau, e a resposta é 409
    // com a frase da escada — 400 escondaria o motivo real.
    mocks.setXp!(SELF_ID, 0);
    const response = await patch(SELF_ID, { badgeId: 10, action: "equip" });
    expect(response.status).toBe(409);
    expect((await read(response)).error).toBe("Seu elo Bronze permite equipar até 0 troféus.");
    expect(mocks.owned.find((row) => row.badgeId === 10 && row.userId === SELF_ID)?.equipped).toBe(false);
  });

  it("em PRATA (XP 400) o primeiro cabe e o segundo é recusado com o MESMO limite", async () => {
    const first = await patch(SELF_ID, { badgeId: 10, action: "equip" });
    expect(first.status).toBe(200);
    expect(await read(first)).toEqual({
      outcome: {
        userId: SELF_ID,
        badgeId: 10,
        action: "equip",
        elo: "PRATA",
        slots: 1,
        equippedBefore: 0,
        equippedAfter: 1,
        unchanged: false,
      },
    });

    const second = await patch(SELF_ID, { badgeId: 11, action: "equip" });
    expect(second.status).toBe(409);
    expect((await read(second)).error).toBe("Seu elo Prata permite equipar até 1 troféu.");
  });

  it("subir o XP sobe o teto sem mexer em nada mais: OURO (900) abre 2 slots", async () => {
    login(["VOLUNTARIO"], OTHER_ID);
    mocks.setXp!(OTHER_ID, 900);
    const response = await patch(OTHER_ID, { badgeId: 10, action: "equip" });
    expect(response.status).toBe(200);
    expect((await read(response)).outcome).toMatchObject({ elo: "OURO", slots: 2, equippedAfter: 1 });
  });
});

describe("PATCH /api/users/[id]/trophies — os estados que o equipar pode ter", () => {
  it("troféu não conquistado é 404 com a frase do caminho existente", async () => {
    const response = await patch(SELF_ID, { badgeId: 777, action: "equip" });
    expect(response.status).toBe(404);
    expect((await read(response)).error).toBe(TROPHY_NOT_EARNED_MESSAGE);
  });

  it("desequipar o que não está equipado é 200 com `unchanged: true` (botão martelado não é evento)", async () => {
    const response = await patch(SELF_ID, { badgeId: 10, action: "unequip" });
    expect(response.status).toBe(200);
    expect((await read(response)).outcome).toMatchObject({ action: "unequip", unchanged: true, equippedBefore: 0, equippedAfter: 0 });
  });

  it("equipar o que já está equipado é 200 com `unchanged: true` e não muda o estado", async () => {
    expect((await patch(SELF_ID, { badgeId: 10, action: "equip" })).status).toBe(200);
    const again = await patch(SELF_ID, { badgeId: 10, action: "equip" });
    expect(again.status).toBe(200);
    expect((await read(again)).outcome).toMatchObject({ unchanged: true, equippedBefore: 1, equippedAfter: 1 });
    expect(mocks.owned.filter((row) => row.equipped).length).toBe(1);
  });

  it("a escrita chega à port com o elo e o slot LIDOS da progressão, e a chave da linha nomeia pessoa e troféu", async () => {
    await patch(SELF_ID, { badgeId: 10, action: "equip" });
    expect(mocks.writes).toEqual([
      {
        userId: SELF_ID,
        badgeId: 10,
        action: "equip",
        slots: 1,
        elo: "PRATA",
        description: `GAMIFICATION:TROPHY_EQUIP:${SELF_ID}:10`,
      },
    ]);
  });

  it("pessoa sem trilha nenhuma (usuário inexistente) é 404 antes de tocar o troféu", async () => {
    login(["VOLUNTARIO"], 4242);
    const response = await patch(4242, { badgeId: 10, action: "equip" });
    expect(response.status).toBe(404);
    expect((await read(response)).error).toBe("Usuário não encontrado");
  });
});
