/**
 * V5-12 (DEC-143/177) — a regra que o campo `users.profileVisibility` promete, congelada
 * antes do código.
 *
 * O guia descreve três valores desde sempre; o servidor os ignorava (achado medido
 * 2026-10-13). A regra:
 *   - `public`     → qualquer autenticado (é o comportamento aberto de hoje, agora decidido);
 *   - `members_only` → quem participa de um projeto em comum (a casa por vínculo, DEC-149);
 *   - `private`    → próprio + gestão (MANAGE_USERS) — exatamente o gate que existia.
 *
 * Realidades congeladas:
 *   1. O próprio vê o próprio perfil sempre, qualquer que seja o valor ou o status.
 *   2. Gestão (MANAGE_USERS) vê todos — é a "administração" da tabela do guia, e é a mesma
 *      autoridade que edita o perfil (DEC-138).
 *   3. Perfil de quem NÃO está `active` (pending/rejected/suspended) não é leitura aberta:
 *      a visibilidade descreve a pessoa dentro do sistema; quem aguarda aprovação ou foi
 *      rejeitado/suspenso segue o gate antigo (próprio + gestão). Suspenso não recebe e não
 *      é exposto (mesma linha da DEC-55).
 *   4. Ator de sistema passa — o bypass declarado do DEC-54 é de rotina, não de pessoa;
 *      nenhuma rota fabrica ator de sistema (guarda `system-callers`).
 */
import { describe, expect, it } from "vitest";

import {
  canActorViewProfile,
  systemActor,
  userActor,
  SYSTEM_REASONS,
} from "@/backend/domain";

const active = (visibility: "public" | "members_only" | "private") => ({
  id: 7,
  profileVisibility: visibility,
  status: "active",
});

const voluntario = userActor(42, ["VOLUNTARIO"]);
const pesquisador = userActor(42, ["PESQUISADOR"]);
const coordenador = userActor(42, ["COORDENADOR"]);
const gerente = userActor(42, ["GERENTE"]);
const gerenteProjeto = userActor(42, ["GERENTE_PROJETO"]);

describe("canActorViewProfile (V5-12, DEC-143)", () => {
  it("public: qualquer autenticado lê — é o aberto de hoje, agora decidido", () => {
    expect(canActorViewProfile(voluntario, active("public"), false)).toBe(true);
    expect(canActorViewProfile(pesquisador, active("public"), false)).toBe(true);
  });

  it("members_only: casa por projeto em comum; sem vínculo em comum não lê", () => {
    expect(canActorViewProfile(voluntario, active("members_only"), true)).toBe(true);
    expect(canActorViewProfile(voluntario, active("members_only"), false)).toBe(false);
  });

  it("private: só gestão — o gate que já existia, agora nomeado", () => {
    expect(canActorViewProfile(voluntario, active("private"), true)).toBe(false);
    expect(canActorViewProfile(gerenteProjeto, active("private"), true)).toBe(false);
    expect(canActorViewProfile(coordenador, active("private"), false)).toBe(true);
    expect(canActorViewProfile(gerente, active("private"), false)).toBe(true);
  });

  it("o próprio vê o próprio perfil qualquer que seja o valor e o status", () => {
    const proprio = userActor(7, ["VOLUNTARIO"]);
    expect(canActorViewProfile(proprio, active("private"), false)).toBe(true);
    expect(canActorViewProfile(proprio, { id: 7, profileVisibility: "members_only", status: "pending" }, false)).toBe(true);
  });

  it("gestão lê todos os valores, com ou sem vínculo em comum", () => {
    for (const visibility of ["public", "members_only", "private"] as const) {
      expect(canActorViewProfile(coordenador, active(visibility), false)).toBe(true);
      expect(canActorViewProfile(gerente, active(visibility), true)).toBe(true);
    }
  });

  it("perfil de quem não é ATIVO não é leitura aberta — visibilidade descreve quem está dentro", () => {
    for (const status of ["pending", "rejected", "suspended"]) {
      expect(canActorViewProfile(voluntario, { id: 7, profileVisibility: "public", status }, false)).toBe(false);
      expect(canActorViewProfile(voluntario, { id: 7, profileVisibility: "members_only", status }, true)).toBe(false);
      expect(canActorViewProfile(coordenador, { id: 7, profileVisibility: "private", status }, false)).toBe(true);
    }
  });

  it("ator de sistema passa — o bypass declarado do DEC-54", () => {
    expect(canActorViewProfile(systemActor(SYSTEM_REASONS.CERTIFICATE_REMINDER), active("private"), false)).toBe(true);
  });
});
