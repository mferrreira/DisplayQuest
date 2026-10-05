/**
 * DEC-54 (D4, B6-2b) — o ator-de-sistema.
 *
 * `systemActor(reason)` é um bypass declarado: um `ActorRef` de sistema passa por
 * `requireActorPermission` sem checar permissão nenhuma. Isso é intencional — uma varredura
 * agendada não tem papel a segurar, e inventar `SYSTEM_SWEEP` como concessão seria cerimônia sem
 * segurança. O que torna o bypass aceitável é que ele é tipado (não dá para esquecer de passar
 * um ator, porque o comando sem `actor` não compila) e não é alcançável a partir de um pedido.
 *
 * Este arquivo fixa as DUAS metades dessa garantia:
 *
 *  1. a regra em si (`requireActorPermission`) — sistema passa, usuário passa ou leva 403, e a
 *     mensagem default é a mesma de `assertPermission`;
 *  2. o teste que falha o build se alguma rota declarar um `systemActor`. É a única defesa real
 *     contra alguém "corrigindo" um 403 em `app/api/**` trocando o ator por um de sistema, que é
 *     exatamente o tipo de erro que sobrevive a revisão e some em produção.
 *
 * A varredura é por GREP de propósito: é a única forma de cobrir código que não roda em nenhum
 * teste. Um teste de rota não pegaria uma rota que ninguém chamou, e estas são 41 rotas em migração.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ACCESS_DENIED_MESSAGE,
  ForbiddenError,
  assertPermission,
  requireActorPermission,
  systemActor,
  userActor,
} from "@/backend/domain";

describe("requireActorPermission", () => {
  it("usuário com a permissão passa", () => {
    expect(() => requireActorPermission(userActor(["COORDENADOR"]), "MANAGE_NOTIFICATIONS")).not.toThrow();
    expect(() => requireActorPermission(userActor(["GERENTE"]), "MANAGE_NOTIFICATIONS")).not.toThrow();
  });

  it("usuário sem a_permissions leva ForbiddenError com a mensagem passada", () => {
    try {
      requireActorPermission(userActor(["VOLUNTARIO"]), "MANAGE_NOTIFICATIONS", "Sem permissão para criar notificações");
      throw new Error("deveria ter lançado ForbiddenError");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).message).toBe("Sem permissão para criar notificações");
    }
  });

  it("a mensagem default é a mesma de assertPermission (bytes idênticos)", () => {
    const viaActor = (() => {
      try {
        requireActorPermission(userActor(["VOLUNTARIO"]), "MANAGE_REWARDS");
      } catch (error) {
        return (error as Error).message;
      }
      return null;
    })();
    const viaAssert = (() => {
      try {
        assertPermission(["VOLUNTARIO"], "MANAGE_REWARDS");
      } catch (error) {
        return (error as Error).message;
      }
      return null;
    })();
    expect(viaActor).toBe(viaAssert);
    expect(viaActor).toBe(ACCESS_DENIED_MESSAGE);
  });

  it("ator de sistema passa em QUALQUER permissão, e é isso que o torna um bypass nomeado", () => {
    for (const reason of ["NIGHTLY_SWEEP", "SCHEDULED_PAUSE", "WEEKLY_RESET", "SYSTEM_EVENT"] as const) {
      for (const permission of ["MANAGE_USERS", "MANAGE_NOTIFICATIONS", "MANAGE_PURCHASES"] as const) {
        expect(() => requireActorPermission(systemActor(reason), permission)).not.toThrow();
      }
    }
  });

  it("roles sujos NEGAM, não estouram (mesmo contrato de hasPermission)", () => {
    for (const dirty of [undefined, null, "COORDENADOR", 42, {}, [], ["DESCONHECIDO"]]) {
      expect(() => requireActorPermission(userActor(dirty), "MANAGE_USERS")).toThrow(ForbiddenError);
    }
  });

  it("o motivo é rótulo, não regra: mudar o SYSTEM_REASON não muda nenhuma decisão", () => {
    // Documenta de propósito a fraqueza escolhida: `reason` não é consultado em runtime. Ele
    // existe para auditoria — cinco call sites, cada um com teste nomeando o motivo.
    expect(() => requireActorPermission(systemActor("SYSTEM_EVENT"), "MANAGE_USERS")).not.toThrow();
    expect(() => requireActorPermission(systemActor("WEEKLY_RESET"), "MANAGE_USERS")).not.toThrow();
  });
});

describe("nenhuma rota pode declarar um ator de sistema", () => {
  /** Arquivos de rota e qualquer coisa que possa chamar `getBackendComposition`. */
  function collect(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) collect(full, acc);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) acc.push(full);
    }
    return acc;
  }

  it("app/api não contém systemActor( em nenhum arquivo", () => {
    const offenders = collect(join(process.cwd(), "app", "api"))
      .filter((file) => /\bsystemActor\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(`${process.cwd()}/`, ""));

    // Sem isto, trocar `userActor(...)` por `systemActor(...)` numa rota para "resolver" um 403
    // desativaria a autorização de verdade, sem erro de tipo e sem teste de rota que perceba.
    expect(offenders).toEqual([]);
  });

  it("app/api usa userActor e não monta objeto de ator à mão", () => {
    const manual = collect(join(process.cwd(), "app", "api"))
      .filter((file) => /kind:\s*["']user["']/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(`${process.cwd()}/`, ""));
    expect(manual).toEqual([]);
  });
});