// @vitest-environment node
/**
 * plan-v22 (R5, DEC-265) — o campo "SE BOLSISTA" na rota de pessoa.
 *
 * O duplo de módulo delega nas MESMAS funções do domínio que os use cases chamam (padrão
 * DEC-90): a negação vem dos papéis do ator, e a escrita de seBolsista passa pela única
 * função de normalização do caminho (`applyPersonDataFields`). O que estes testes fixam:
 *   1. A leitura do perfil traz `seBolsista` (a coluna chega na resposta).
 *   2. A própria pessoa escreve seBolsista no PATCH do perfil.
 *   3. Quem gerencia contas escreve seBolsista no PUT do painel.
 *   3b. seBolsista é self-editável: o PUT da própria pessoa não é filtrado.
 *   4. Terceiro sem gestão leva 403 na escrita.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  applyPersonDataFields,
  PROFILE_DENIED_MESSAGE,
  filterSelfEditableUserFields,
  requireActorSelfOrPermission,
  toPublicUserWithCpf,
  type ActorRef,
} from "@/backend/domain";

type StoreRecord = {
  id: number;
  name: string;
  email: string;
  points: number;
  completedTasks: number;
  status: "active";
  weekHours: number;
  currentWeekHours: number;
  profileVisibility: "public";
  bio: null;
  avatar: null;
  roles: ["VOLUNTARIO"];
  cpf: string | null;
  registrationNumber: string | null;
  course: string | null;
  scholarshipType: string | null;
  fundingAgency: string | null;
  fundingAgencyOther: string | null;
  level: string | null;
  seBolsista: string | null;
};

const mocks = vi.hoisted(() => {
  const store: Record<number, StoreRecord> = {
    7: {
      id: 7,
      name: "Eleissa",
      email: "eleissa@lab.com",
      points: 10,
      completedTasks: 1,
      status: "active",
      weekHours: 20,
      currentWeekHours: 0,
      profileVisibility: "public",
      bio: null,
      avatar: null,
      roles: ["VOLUNTARIO"],
      cpf: "13590015659",
      registrationNumber: "192201",
      course: "Ciências Biológicas",
      scholarshipType: "PIBIC_JR",
      fundingAgency: "IFNMG",
      fundingAgencyOther: null,
      level: "GRADUACAO",
      seBolsista: null,
    },
  };
  const auth = { actor: { id: 7, roles: ["VOLUNTARIO"] } };
  const fakeModule = {
    findUserById: async (actor: ActorRef, id: number, deniedMessage?: string) => {
      const row = store[id];
      if (!row) return null;
      requireActorSelfOrPermission(actor, id, "MANAGE_USERS", deniedMessage);
      return toPublicUserWithCpf(row);
    },
    updateUserProfile: async (actor: ActorRef, id: number, data: Record<string, unknown>) => {
      const row = store[id];
      if (!row) throw new Error("não deveria chegar aqui sem usuário");
      requireActorSelfOrPermission(actor, id, "MANAGE_USERS", PROFILE_DENIED_MESSAGE);
      applyPersonDataFields(row, data);
      return toPublicUserWithCpf(row);
    },
    updateUser: async (actor: ActorRef, id: number, data: Record<string, unknown>) => {
      const row = store[id];
      if (!row) throw new Error("não deveria chegar aqui sem usuário");
      const canManage =
        actor.kind === "user" && (actor.roles as readonly string[]).includes("MANAGE_USERS");
      requireActorSelfOrPermission(actor, id, "MANAGE_USERS");
      const editableData = canManage ? data : filterSelfEditableUserFields(data);
      applyPersonDataFields(row, editableData);
      return toPublicUserWithCpf(row);
    },
  };
  return { store, auth, fakeModule };
});

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ userManagement: mocks.fakeModule }),
}));

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () => ({ actor: mocks.auth.actor }),
}));

import { GET as profileGet, PATCH as profilePatch } from "@/app/api/users/[id]/profile/route";
import { PUT as userPut } from "@/app/api/users/[id]/route";

function makeRequest(path: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function login(roles: string[], id = 7) {
  mocks.auth.actor = { id, roles };
}

beforeEach(() => {
  mocks.store[7].seBolsista = null;
  login(["VOLUNTARIO"], 7);
});

describe("leitura do SE BOLSISTA no perfil", () => {
  it("a leitura do perfil traz seBolsista", async () => {
    mocks.store[7].seBolsista = "BAT-DI-SUP";

    const res = await profileGet(makeRequest("http://localhost:3000/api/users/7/profile"), idContext("7"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.seBolsista).toBe("BAT-DI-SUP");
  });
});

describe("escrita do SE BOLSISTA", () => {
  it("a própria pessoa escreve seBolsista no PATCH do perfil", async () => {
    const res = await profilePatch(
      makeRequest("http://localhost:3000/api/users/7/profile", { method: "PATCH", body: { seBolsista: "  BAT-DI-SUP  " } }),
      idContext("7"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.seBolsista).toBe("BAT-DI-SUP");
    expect(mocks.store[7].seBolsista).toBe("BAT-DI-SUP");
  });

  it("quem gerencia contas escreve seBolsista no PUT do painel", async () => {
    login(["COORDENADOR"], 1);

    const res = await userPut(
      makeRequest("http://localhost:3000/api/users/7", { method: "PUT", body: { seBolsista: "BIC-EXTRASUP" } }),
      idContext("7"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.seBolsista).toBe("BIC-EXTRASUP");
  });

  it("seBolsista é self-editável — o PUT da própria pessoa não é filtrado", async () => {
    const res = await userPut(
      makeRequest("http://localhost:3000/api/users/7", { method: "PUT", body: { seBolsista: "BAT-EXTSA" } }),
      idContext("7"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.seBolsista).toBe("BAT-EXTSA");
  });

  it("terceiro sem gestão leva 403, e nada é escrito", async () => {
    login(["VOLUNTARIO"], 9);

    const res = await profilePatch(
      makeRequest("http://localhost:3000/api/users/7/profile", { method: "PATCH", body: { seBolsista: "X" } }),
      idContext("7"),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(PROFILE_DENIED_MESSAGE);
    expect(mocks.store[7].seBolsista).toBeNull();
  });
});
