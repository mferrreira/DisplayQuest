import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { hasPermission } from "@/lib/auth/rbac";

/**
 * V6-8 · AC-V6-35 (RF-V6.16 R5, caso C da §2.9).
 *
 * A fila de Aprovações da loja só chegava ao GERENTE pela METADE: a página mostrava a aba com
 * `MANAGE_REWARDS` (que tem GERENTE), mas o `reward-context` calculava o escopo com uma lista
 * escrita à mão (`LABORATORISTA || COORDENADOR`) e mandava `fetchPurchases(userId)` — o GERENTE
 * via só as próprias compras. O backend já autorizava TODAS as compras por `MANAGE_PURCHASES`
 * (`purchase-query-scope.ts`), então o cliente sub-pedia.
 *
 * O contrato que este teste trava: a fonte do escopo é a MESMA chave que o servidor aplica
 * (`MANAGE_REWARDS`), nunca uma cópia local. Quem porta a chave pede `undefined` (todas); quem
 * não porta pede o próprio `userId`. Se alguém reintroduzir a lista à mão, o caso do GERENTE cai.
 */

const mocks = vi.hoisted(() => ({
  roles: ["GERENTE"] as string[],
  rewardsGetAll: vi.fn(async () => ({ rewards: [] as unknown[] })),
  purchasesGetAll: vi.fn(async () => ({ purchases: [] as unknown[] })),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: 7, name: "Quem", roles: mocks.roles } }),
}));

vi.mock("@/contexts/api-client", () => ({
  RewardsAPI: { getAll: mocks.rewardsGetAll },
  PurchasesAPI: { getAll: mocks.purchasesGetAll },
}));

import { RewardProvider } from "@/contexts/reward-context";

const renderProvider = () => render(<RewardProvider>{null}</RewardProvider>);

beforeEach(() => {
  mocks.purchasesGetAll.mockClear();
  mocks.rewardsGetAll.mockClear();
});

describe("escopo da fila de compras — a chave do servidor manda", () => {
  it("GERENTE porta MANAGE_REWARDS e pede TODAS as compras (undefined)", async () => {
    expect(hasPermission(["GERENTE"], "MANAGE_REWARDS")).toBe(true);
    mocks.roles = ["GERENTE"];

    renderProvider();

    await waitFor(() => expect(mocks.purchasesGetAll).toHaveBeenCalledWith(undefined));
  });

  it("COORDENADOR e LABORATORISTA também pedem todas", async () => {
    for (const roles of [["COORDENADOR"], ["LABORATORISTA"]]) {
      mocks.purchasesGetAll.mockClear();
      mocks.roles = roles;
      renderProvider();
      await waitFor(() => expect(mocks.purchasesGetAll).toHaveBeenCalledWith(undefined));
    }
  });

  it("VOLUNTARIO, sem a chave, só pede as próprias (userId)", async () => {
    expect(hasPermission(["VOLUNTARIO"], "MANAGE_REWARDS")).toBe(false);
    mocks.roles = ["VOLUNTARIO"];

    renderProvider();

    await waitFor(() => expect(mocks.purchasesGetAll).toHaveBeenCalledWith(7));
    expect(mocks.purchasesGetAll).not.toHaveBeenCalledWith(undefined);
  });
});
