// @vitest-environment node
/**
 * B6-1b (D4) — the cron gate as a use case.
 *
 * Before this batch the rule was `ensurePermission(auth.actor, "MANAGE_USERS", ...)` written in
 * `app/api/cron/status/route.ts`, and nothing else in the system could enforce it. These tests
 * pin the rule where it now lives, with a fake port — so they assert the decision itself, not
 * an HTTP translation of it (the HTTP contract is pinned by
 * tests/unit/api/cron-status-roles.test.ts).
 *
 * The ordering case matters and is easy to lose: an unauthorised actor sending an UNKNOWN action
 * gets ForbiddenError, not ValidationError, because the route used to check the role before it
 * read the body. Flipping that would turn a 403 into a 400 for every unauthorised caller.
 */
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, ValidationError } from "@/backend/domain";
import { CRON_FORBIDDEN_MESSAGE } from "@/backend/modules/work-execution/application/use-cases/internal/require-cron-operator";
import { GetCronStatusUseCase } from "@/backend/modules/work-execution/application/use-cases/get-cron-status.use-case";
import {
  ExecuteManualCronResetUseCase,
  MANUAL_RESET_ACTION,
  UNKNOWN_CRON_ACTION_MESSAGE,
} from "@/backend/modules/work-execution/application/use-cases/execute-manual-cron-reset.use-case";

const STATUS = {
  isInitialized: true,
  weeklyResetRunning: false,
  weeklyResetNextRun: "2026-10-05T03:00:00.000Z",
  weeklyResetSchedule: "0 0 * * 1 (Segunda-feira às 00:00)",
};

function fakePort() {
  return {
    getStatus: vi.fn(async () => STATUS),
    executeManualReset: vi.fn(async () => undefined),
  };
}

const GESTORES = ["COORDENADOR", "GERENTE"] as const;

describe("GetCronStatusUseCase", () => {
  it.each(GESTORES)("%s lê o status", async (papel) => {
    const port = fakePort();
    const status = await new GetCronStatusUseCase(() => port.getStatus()).execute({
      actorRoles: [papel],
    });

    expect(status).toEqual(STATUS);
    expect(port.getStatus).toHaveBeenCalledOnce();
  });

  it.each(["LABORATORISTA", "GERENTE_PROJETO", "COLABORADOR", "PESQUISADOR", "VOLUNTARIO"])(
    "%s é barrado e o serviço NÃO é tocado",
    async (papel) => {
      const port = fakePort();
      await expect(
        new GetCronStatusUseCase(() => port.getStatus()).execute({ actorRoles: [papel] }),
      ).rejects.toThrow(ForbiddenError);
      expect(port.getStatus).not.toHaveBeenCalled();
    },
  );

  it("o 403 carrega a mensagem congelada", async () => {
    await expect(
      new GetCronStatusUseCase(async () => STATUS).execute({ actorRoles: ["VOLUNTARIO"] }),
    ).rejects.toThrow(CRON_FORBIDDEN_MESSAGE);
  });

  it.each([undefined, null, [], "COORDENADOR", 42, {}])(
    "roles sujas (%s) não concedem acesso — hasPermission nunca lança",
    async (actorRoles) => {
      await expect(
        new GetCronStatusUseCase(async () => STATUS).execute({ actorRoles }),
      ).rejects.toThrow(ForbiddenError);
    },
  );
});

describe("ExecuteManualCronResetUseCase", () => {
  it.each(GESTORES)("%s dispara o reset manual", async (papel) => {
    const port = fakePort();
    const result = await new ExecuteManualCronResetUseCase(() => port.executeManualReset()).execute({
      actorRoles: [papel],
      action: MANUAL_RESET_ACTION,
    });

    expect(result).toEqual({ message: "Reset manual executado com sucesso" });
    expect(port.executeManualReset).toHaveBeenCalledOnce();
  });

  it("ação desconhecida é ValidationError para quem tem o gate", async () => {
    const port = fakePort();
    await expect(
      new ExecuteManualCronResetUseCase(() => port.executeManualReset()).execute({
        actorRoles: ["COORDENADOR"],
        action: "nope",
      }),
    ).rejects.toThrow(ValidationError);
    expect(port.executeManualReset).not.toHaveBeenCalled();
    // A mensagem congelada do 400 legado sobreviveu intacta.
    expect(UNKNOWN_CRON_ACTION_MESSAGE).toBe("Ação não reconhecida");
  });

  it("ORDEM: não autorizado + ação desconhecida é ForbiddenError, não ValidationError", async () => {
    const port = fakePort();
    // O 403 precisa vir primeiro: a rota checava o papel antes de ler o corpo, então um POST
    // de ator sem papel com ação inválida respondia 403 e não 400.
    await expect(
      new ExecuteManualCronResetUseCase(() => port.executeManualReset()).execute({
        actorRoles: ["VOLUNTARIO"],
        action: "nope",
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(port.executeManualReset).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", 0, false, {}])(
    "ação ausente/inválida (%s) continua sendo 400 depois do gate",
    async (action) => {
      const port = fakePort();
      await expect(
        new ExecuteManualCronResetUseCase(() => port.executeManualReset()).execute({
          actorRoles: ["GERENTE"],
          action,
        }),
      ).rejects.toThrow(ValidationError);
      expect(port.executeManualReset).not.toHaveBeenCalled();
    },
  );

  it("o erro do serviço sobe intacto (a rota o mapeia no 500 legado)", async () => {
    const boom = new Error("scheduler explodiu");
    await expect(
      new ExecuteManualCronResetUseCase(async () => {
        throw boom;
      }).execute({ actorRoles: ["COORDENADOR"], action: MANUAL_RESET_ACTION }),
    ).rejects.toBe(boom);
  });
});