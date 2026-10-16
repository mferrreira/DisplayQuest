/**
 * V5-4b (DEC-149) — a tela de Membros do projeto escreve o DIFF do vínculo.
 *
 * Por que este arquivo existe: o que a tela manda é metade da regra. O servidor trata chave
 * ausente como "não mexer", então um formulário que mandasse o registro inteiro apagaria o que a
 * pessoa não tocou — e isso não aparece em teste de rota nenhum. A rede é MSW local gravando o
 * corpo (padrão da casa, `admin-panel-user-settings.test.tsx`): hook e cliente são os REAIS, o
 * `Select`/`Input` do Radix são os REAIS (shims de jsdom em `tests/setup.ts`), e só sessão e
 * transporte são dobrados.
 *
 * O que este arquivo fixa:
 *   1. os cinco campos chegam no dialog "Editar vínculo" (aberto pelo menu de ações do membro)
 *      com o valor gravado, não em branco;
 *   2. abrir e salvar sem mexer não dispara escrita nenhuma;
 *   3. o corpo enviado é `{ action: "set_profile", membershipId, <só o que mudou> }`;
 *   4. limpar a carga envia `null` (existe caminho para tirar uma carga declarada);
 *   5. quem não gerencia o projeto não vê controle de escrita, e vê a linha resumo — só quando
 *      existe dado;
 *   6. o vocabulário da tela vem do domínio (`Bolsista`/`Inativo`), não de rótulo inventado no
 *      componente (lição da DEC-96);
 *   7. cada controle tem o nome da pessoa no nome acessível: cinco campos se repetem por membro
 *      na mesma tela (mesma família da DEC-86).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ProjectMembersManagement } from "@/components/features/project-members-management";
import type { Project } from "@/contexts/types";
import { server } from "@/tests/mocks/server";

const mocks = vi.hoisted(() => ({
  roles: ["COORDENADOR"] as string[],
  toasts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: mocks.roles.length
      ? { id: 1, name: "Coordenador", email: "coord@lab.com", roles: mocks.roles }
      : null,
  }),
}));

vi.mock("@/contexts/use-toast", () => ({
  useToast: () => ({ toast: (payload: Record<string, unknown>) => mocks.toasts.push(payload) }),
}));

const PROJECT_ID = 10;

const project = {
  id: PROJECT_ID,
  name: "Projeto Guia",
  description: null,
  status: "active",
  leaderId: null,
  memberCount: 2,
} as unknown as Project;

type StoredMember = {
  id: number
  userId: number
  userName: string
  userEmail: string
  roles: string[]
  joinedAt: string
  lattes: string | null
  cargaHoraria: number | null
  categoria: string | null
  situacao: string
  dataEntrada: string | null
};

const ana: StoredMember = {
  id: 5,
  userId: 4,
  userName: "Ana",
  userEmail: "ana@lab.com",
  roles: ["VOLUNTARIO"],
  joinedAt: "2026-02-01T12:00:00.000Z",
  lattes: "1234567890123456",
  cargaHoraria: 20,
  categoria: "BOLSISTA",
  situacao: "INATIVO",
  dataEntrada: "2026-02-01",
};

const beto: StoredMember = {
  id: 6,
  userId: 8,
  userName: "Beto",
  userEmail: "beto@lab.com",
  roles: ["COLABORADOR"],
  joinedAt: "2026-02-02T12:00:00.000Z",
  lattes: null,
  cargaHoraria: null,
  categoria: null,
  situacao: "ATIVO",
  dataEntrada: null,
};

let stored: StoredMember[];
let patches: Array<Record<string, unknown>>;

const PROFILE_KEYS = ["lattes", "cargaHoraria", "categoria", "situacao", "dataEntrada"];

function captureMembers() {
  stored = [ana, beto];
  patches = [];

  server.use(
    http.get(`/api/projects/${PROJECT_ID}/members`, () =>
      HttpResponse.json({
        members: stored.map((member) => ({ ...member, totalHours: 0, currentWeekHours: 0 })),
      }),
    ),
    http.get("/api/users", () => HttpResponse.json({ users: [] })),
    // O duplo grava o corpo e aplica o que ele recebe. Não reimplementa regra nenhuma: quem
    // normaliza é o servidor (congelado em `project-members-routes.test.ts`).
    http.patch(`/api/projects/${PROJECT_ID}/members`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patches.push(body);

      const id = Number(body.membershipId);
      stored = stored.map((member) =>
        member.id === id
          ? {
              ...member,
              ...Object.fromEntries(
                Object.entries(body).filter(([key]) => PROFILE_KEYS.includes(key)),
              ),
            }
          : member,
      );

      return HttpResponse.json({ membership: { ...stored.find((member) => member.id === id)! } });
    }),
  );
}

async function renderScreen() {
  render(<ProjectMembersManagement project={project} />);
  await screen.findByText("Ana");
}

/** Abre o dialog de vínculo pelo menu de ações do membro. */
async function openProfile(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `Mais ações para ${name}` }));
  await user.click(await screen.findByRole("menuitem", { name: "Editar vínculo" }));
  await screen.findByLabelText(`Currículo Lattes de ${name}`);
}

function saveButton(name: string) {
  return screen.getByRole("button", { name: `Salvar vínculo de ${name}` });
}

beforeEach(() => {
  mocks.roles = ["COORDENADOR"];
  mocks.toasts = [];
  captureMembers();
});

describe("painel de Membros — os dados do vínculo chegam com o valor gravado", () => {
  it("os cinco controles nascem com o que está no banco, não em branco", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    expect(screen.getByLabelText("Currículo Lattes de Ana")).toHaveValue("1234567890123456");
    expect(screen.getByLabelText("Carga contratada (h/semana) de Ana")).toHaveValue(20);
    expect(screen.getByRole("combobox", { name: "Categoria do vínculo de Ana" })).toHaveTextContent(
      "Bolsista",
    );
    expect(screen.getByRole("combobox", { name: "Situação do vínculo de Ana" })).toHaveTextContent(
      "Inativo",
    );
    expect(screen.getByLabelText("Data de entrada de Ana")).toHaveValue("2026-02-01");
  });

  it("o vínculo sem dado abre vazio, com categoria 'Sem categoria' e situação Ativo", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Beto");

    expect(screen.getByLabelText("Currículo Lattes de Beto")).toHaveValue("");
    // `toHaveValue(null)`: num `<input type="number">` vazio é assim que a Testing Library devolve
    // o valor (medido escrevendo este teste).
    expect(screen.getByLabelText("Carga contratada (h/semana) de Beto")).toHaveValue(null);
    expect(screen.getByRole("combobox", { name: "Categoria do vínculo de Beto" })).toHaveTextContent(
      "Sem categoria",
    );
    expect(screen.getByRole("combobox", { name: "Situação do vínculo de Beto" })).toHaveTextContent("Ativo");
  });

  it("o rótulo que a tela mostra é o do domínio (DEC-96): token não vira label inventado", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    await user.click(screen.getByRole("combobox", { name: "Categoria do vínculo de Ana" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Sem categoria",
      "Bolsista",
      "Voluntário",
    ]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("combobox", { name: "Situação do vínculo de Ana" }));
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Ativo",
      "Inativo",
    ]);
  });
});

describe("painel de Membros — salvar manda só o diff", () => {
  it("abrir e salvar sem mexer não escreve nada", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    await user.click(saveButton("Ana"));

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(patches).toEqual([]);
    expect(mocks.toasts).toEqual([]);
  });

  it("digitar o Lattes envia o campo sozinho, com a ação e o id do vínculo", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    const lattes = screen.getByLabelText("Currículo Lattes de Ana");
    await user.clear(lattes);
    await user.type(lattes, "9876543210987654");
    await user.click(saveButton("Ana"));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({
      action: "set_profile",
      membershipId: 5,
      lattes: "9876543210987654",
    });
    // O aviso é provado no mock do `useToast` (o `<Toaster/>` do Sonner não está montado aqui —
    // montá-lo exigiria `matchMedia`, medido no V4-5a).
    expect(mocks.toasts).toEqual([{ title: "Sucesso", description: "Dados de Ana atualizados" }]);
  });

  it("trocar a categoria envia o TOKEN, não o rótulo", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    await user.click(screen.getByRole("combobox", { name: "Categoria do vínculo de Ana" }));
    await user.click(await screen.findByRole("option", { name: "Voluntário" }));
    await user.click(saveButton("Ana"));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ action: "set_profile", membershipId: 5, categoria: "VOLUNTARIO" });
  });

  it("limpar a carga envia `null`: existe caminho para tirar uma carga declarada", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    await user.clear(screen.getByLabelText("Carga contratada (h/semana) de Ana"));
    await user.click(saveButton("Ana"));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ action: "set_profile", membershipId: 5, cargaHoraria: null });
  });

  it("o que não foi tocado não sai no corpo — e por isso não é apagado no servidor", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    await user.type(screen.getByLabelText("Currículo Lattes de Ana"), "00");
    await user.click(saveButton("Ana"));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(Object.keys(patches[0]).sort()).toEqual(["action", "lattes", "membershipId"]);
  });

  it("a data de entrada sai como data civil", async () => {
    const user = userEvent.setup({ delay: null });
    await renderScreen();
    await openProfile(user, "Ana");

    // `fireEvent` e não `user.type`: `<input type="date">` no jsdom não aceita digitação de
    // calendário, mas o `change` é exatamente o que o navegador dispara ao escolher o dia.
    fireEvent.change(screen.getByLabelText("Data de entrada de Ana"), {
      target: { value: "2026-03-15" },
    });
    await user.click(saveButton("Ana"));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ action: "set_profile", membershipId: 5, dataEntrada: "2026-03-15" });
  });
});

describe("painel de Membros — quem não gerencia o projeto", () => {
  it("não há controle de escrita, e a linha resumo mostra o vínculo em português", async () => {
    mocks.roles = ["VOLUNTARIO"];
    await renderScreen();

    expect(screen.queryByRole("button", { name: /^Salvar vínculo/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Currículo Lattes/)).not.toBeInTheDocument();

    expect(
      screen.getByText(
        "20 h/semana contratadas · Bolsista · Inativo · entrou em 01/02/2026 · Lattes 1234567890123456",
      ),
    ).toBeInTheDocument();
  });

  it("vínculo sem dado nenhum não ganha linha vazia: uma linha para dois membros", async () => {
    mocks.roles = ["VOLUNTARIO"];
    await renderScreen();

    expect(screen.getAllByText(/contratadas/)).toHaveLength(1);
    expect(screen.getByText("Beto")).toBeInTheDocument();
  });
});
