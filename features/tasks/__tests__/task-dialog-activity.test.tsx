/**
 * V5-6 (DEC-99) — o seletor de atividade do formulário de tarefa.
 *
 * O que a tela promete e este arquivo prova:
 *   1. Com projeto selecionado, a lista vem do cronograma DO projeto.
 *   2. Na criação, a atividade VIGENTE vem pré-selecionada (o `current` é o do servidor —
 *      a tela não calcula fuso).
 *   3. A lista da criação não oferece linha passada; a da edição oferece (DEC-99: a recusa é
 *      do seletor, não do servidor — tarefa ligada a etapa que virou passada continua salvável).
 *   4. O submit manda `activityId`; "Sem atividade" manda `null`; corpo SEM a lista carregada
 *      não leva a chave (corpo parcial não apaga vínculo) — carregando ou sem linha, o campo
 *      existe e diz o que está havendo ("Carregando..." / "Sem atividade").
 *   5. Quest global não tem seletor (atividade é do projeto, e quest não tem projeto).
 *   6. O campo monta com o diálogo, não "quando a busca der tempo": carregando nasce
 *      desabilitado, e reabrir o diálogo devolve a lista já buscada do cache do componente.
 *
 * As mutações são dobradas para GRAVAR o corpo enviado — é a prova de o que o cliente manda,
 * não de o que o servidor aceita (isso fica em tests/unit/api/task-activity-link-routes.test.ts).
 * O cronograma é dobrado na seam de lib (precedente medido do V5-5b: sem handler MSW), com gate
 * controlável para segurar o loading e contador para provar a revalidação do reabrir.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskDialog } from "../components/task-dialog";
import { makeTask } from "@/tests/mocks/fixtures/tasks";
import type { ProjectActivity, ProjectCronogramaView } from "@/lib/api/project-cronograma";

const mockUser = {
  id: 2,
  name: "Coordenador",
  email: "coordenador@lab.com",
  roles: ["COORDENADOR"],
};

const mocks = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  updated: [] as Array<{ id: number; data: Record<string, unknown> }>,
  cronogramaView: null as ProjectCronogramaView | null,
  // Gate pendurado: enquanto pendurado, a busca NÃO resolve — é o mundo do "carregando".
  cronogramaGate: null as Promise<void> | null,
  cronogramaCalls: 0,
}));

const activity = (over: Partial<ProjectActivity> & { id: number; order: number; description: string }): ProjectActivity => ({
  projectId: 3,
  responsibleId: null,
  firstMonth: "2026-10",
  lastMonth: "2026-10",
  status: "OPEN",
  requestedBy: null,
  requestedAt: null,
  approvedBy: null,
  approvedAt: null,
  months: ["2026-10"],
  periodoInicio: "2026-10-01",
  periodoFim: "2026-10-31",
  reward: 100,
  current: false,
  ...over,
});

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

vi.mock("@/features/projects", () => ({
  useProjects: () => ({ data: [{ id: 3, name: "Projeto Alfa" }], loading: false }),
}));

vi.mock("@/features/users", () => ({
  useUsers: () => ({ data: [], loading: false }),
}));

vi.mock("@/lib/api/project-members", () => ({
  listProjectMembers: async () => [{ userId: 7, userName: "Bolsista B", userEmail: "b@test.local" }],
}));

vi.mock("@/lib/api/project-cronograma", () => ({
  getCronograma: async () => {
    mocks.cronogramaCalls += 1;
    if (mocks.cronogramaGate) await mocks.cronogramaGate;
    return mocks.cronogramaView;
  },
}));

vi.mock("@/features/tasks/hooks/use-tasks", () => ({
  useTaskMutations: () => ({
    create: {
      mutateAsync: async (body: Record<string, unknown>) => {
        mocks.created.push(body);
        return { id: 77 };
      },
      isPending: false,
    },
    update: {
      mutateAsync: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
        mocks.updated.push({ id, data });
        return {};
      },
      isPending: false,
    },
    createBacklog: { mutateAsync: async () => ({}), isPending: false },
  }),
}));

/**
 * O mundo do cronograma: vigente (cobre 2026-10-14), futura (dez/2026) e passada (mai–ago/2026).
 * O `current` é o que o servidor derivaria — o duplo diz o que a rota real diria, não um cálculo
 * da tela (DEC-90).
 */
function seedCronograma() {
  mocks.cronogramaView = {
    projectId: 3,
    today: "2026-10-14",
    months: ["2026-05", "2026-10", "2026-12"],
    goals: [],
    activities: [
      activity({ id: 40, order: 1, description: "Etapa vigente", firstMonth: "2026-09", lastMonth: "2026-11", current: true, months: ["2026-09", "2026-10", "2026-11"], periodoInicio: "2026-09-01", periodoFim: "2026-11-30" }),
      activity({ id: 41, order: 2, description: "Etapa futura", firstMonth: "2026-12", lastMonth: "2027-01", months: ["2026-12", "2027-01"], periodoInicio: "2026-12-01", periodoFim: "2027-01-31" }),
      activity({ id: 42, order: 3, description: "Etapa passada", firstMonth: "2026-05", lastMonth: "2026-08", months: ["2026-05", "2026-08"], periodoInicio: "2026-05-01", periodoFim: "2026-08-31" }),
    ],
  };
}

function renderDialog(task: ReturnType<typeof makeTask> | null) {
  return render(<TaskDialog open onOpenChange={() => {}} task={task} defaultProjectId={3} />);
}

async function openActivitySelect() {
  const user = userEvent.setup({ delay: null });
  const trigger = await screen.findByRole("combobox", { name: "Atividade da tarefa" });
  // O campo monta desabilitado (loading) e só abre quando a lista termina — abrir antes é
  // click em controle desabilitado.
  await waitFor(() => expect(trigger).not.toBeDisabled());
  await user.click(trigger);
}

beforeEach(() => {
  mocks.created = [];
  mocks.updated = [];
  mocks.cronogramaGate = null;
  mocks.cronogramaCalls = 0;
  seedCronograma();
});

describe("seletor de atividade — criação", () => {
  it("a atividade vigente vem pré-selecionada quando o cronograma carrega", async () => {
    renderDialog(null);

    const trigger = await screen.findByRole("combobox", { name: "Atividade da tarefa" });
    await waitFor(() => expect(trigger).toHaveTextContent("1. Etapa vigente"));
  });

  it("a lista da criação não oferece a etapa passada", async () => {
    renderDialog(null);
    await openActivitySelect();

    expect(await screen.findByRole("option", { name: "1. Etapa vigente" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2. Etapa futura" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "3. Etapa passada" })).not.toBeInTheDocument();
  });

  it("o submit manda o activityId da atividade vigente pré-selecionada", async () => {
    renderDialog(null);
    const user = userEvent.setup({ delay: null });

    const trigger = await screen.findByRole("combobox", { name: "Atividade da tarefa" });
    await waitFor(() => expect(trigger).toHaveTextContent("1. Etapa vigente"));
    await user.type(screen.getByRole("textbox", { name: "Título" }), "Ler os artigos da etapa");
    await user.click(screen.getByRole("button", { name: "Criar Tarefa" }));

    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0].activityId).toBe(40);
    expect(mocks.created[0].projectId).toBe(3);
  });

  it("escolher \"Sem atividade\" manda null", async () => {
    renderDialog(null);
    const user = userEvent.setup({ delay: null });

    await openActivitySelect();
    await user.click(await screen.findByRole("option", { name: "Sem atividade" }));
    await user.type(screen.getByRole("textbox", { name: "Título" }), "Tarefa solta");
    await user.click(screen.getByRole("button", { name: "Criar Tarefa" }));

    expect(mocks.created[0].activityId).toBeNull();
  });

  it("sem linha no cronograma o seletor existe só com \"Sem atividade\", e o corpo não leva a chave", async () => {
    mocks.cronogramaView = { projectId: 3, today: "2026-10-14", months: [], goals: [], activities: [] };
    renderDialog(null);

    // O projeto está selecionado (defaultProjectId), mas não há atividade: o campo continua lá
    // e diz isso — "Sem atividade" é a única opção. Sem opção de lista, o corpo não leva a
    // chave (corpo parcial não apaga vínculo).
    const trigger = await screen.findByRole("combobox", { name: "Atividade da tarefa" });
    await waitFor(() => expect(trigger).not.toBeDisabled());
    expect(trigger).toHaveTextContent("Sem atividade");
    expect(screen.getByText("O cronograma do projeto ainda não tem linhas.")).toBeInTheDocument();

    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByRole("textbox", { name: "Título" }), "Tarefa sem cronograma");
    await user.click(screen.getByRole("button", { name: "Criar Tarefa" }));

    expect(mocks.created[0]).not.toHaveProperty("activityId");
  });

  it("o campo monta com o diálogo e anuncia o carregamento", () => {
    mocks.cronogramaGate = new Promise(() => {});
    renderDialog(null);

    // Sem await: a prova é que o controle existe na montagem, desabilitado, antes de qualquer
    // resposta do servidor — "demora pra aparecer" é exatamente a ausência deste estado.
    const trigger = screen.getByRole("combobox", { name: "Atividade da tarefa" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("Carregando...");
  });

  it("enviar enquanto o cronograma carrega não leva activityId no corpo", async () => {
    mocks.cronogramaGate = new Promise(() => {});
    renderDialog(null);
    const user = userEvent.setup({ delay: null });

    await user.type(screen.getByRole("textbox", { name: "Título" }), "Tarefa no escuro");
    await user.click(screen.getByRole("button", { name: "Criar Tarefa" }));

    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0]).not.toHaveProperty("activityId");
  });

  it("reabrir o diálogo devolve o cronograma já buscado, sem esperar a revalidação", async () => {
    const view = renderDialog(null);
    const first = await screen.findByRole("combobox", { name: "Atividade da tarefa" });
    await waitFor(() => expect(first).toHaveTextContent("1. Etapa vigente"));

    view.rerender(<TaskDialog open={false} onOpenChange={() => {}} task={null} defaultProjectId={3} />);
    view.rerender(<TaskDialog open onOpenChange={() => {}} task={null} defaultProjectId={3} />);

    // Sem await: o cache do componente devolve a lista na hora; a revalidação continua
    // buscando (duas chamadas para dois aberturas), mas o campo não renasce vazio.
    const reopened = screen.getByRole("combobox", { name: "Atividade da tarefa" });
    expect(reopened).toHaveTextContent("1. Etapa vigente");
    expect(mocks.cronogramaCalls).toBe(2);
  });

  it("quest global não tem seletor de atividade", async () => {
    renderDialog(null);
    const user = userEvent.setup({ delay: null });

    await screen.findByRole("combobox", { name: "Atividade da tarefa" });
    await user.click(screen.getByRole("switch", { name: "Quest Global" }));

    expect(screen.queryByRole("combobox", { name: "Atividade da tarefa" })).not.toBeInTheDocument();
  });
});

describe("seletor de atividade — edição", () => {
  it("a tarefa ligada a uma etapa que virou passada mantém o vínculo e a opção na lista", async () => {
    const linked = makeTask({ id: 50, title: "Tarefa da etapa passada", projectId: 3, activityId: 42 });
    renderDialog(linked);

    const trigger = await screen.findByRole("combobox", { name: "Atividade da tarefa" });
    await waitFor(() => expect(trigger).toHaveTextContent("3. Etapa passada"));

    await openActivitySelect();
    expect(await screen.findByRole("option", { name: "3. Etapa passada" })).toBeInTheDocument();
  });

  it("salvar sem mexer no seletor reenvia o mesmo vínculo (o servidor não reescreve)", async () => {
    const linked = makeTask({ id: 50, title: "Tarefa da etapa passada", projectId: 3, activityId: 42 });
    renderDialog(linked);
    const user = userEvent.setup({ delay: null });

    const trigger = await screen.findByRole("combobox", { name: "Atividade da tarefa" });
    await waitFor(() => expect(trigger).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(mocks.updated).toHaveLength(1);
    expect(mocks.updated[0].data.activityId).toBe(42);
  });
});
