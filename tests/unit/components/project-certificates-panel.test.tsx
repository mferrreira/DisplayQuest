/**
 * V5-10b (DEC-75/170/171) — testes de UI do painel de atestados do projeto.
 *
 * O painel é a parte do batch que o `tsc` não cobre. A rede é um `fetch` gravador (mesma
 * razão medida no V5-2c): o corpo gravado prova exatamente o que sai para a rota.
 *
 * Costuras medidas da casa: `useToast` exige `<Toaster/>` montado e `matchMedia` stub LOCAL
 * (V4-5a/V5-6); `userEvent.setup({ delay: null })` (V4-6b); o erro mostrado é a frase do
 * servidor (DEC-90) — o 403 do fake carrega a MESMA mensagem congelada no use case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { ProjectCertificatesPanel } from "@/components/features/project-certificates-panel";

const PROJECT = 7;
const DENIED_MESSAGE = "Usuário não tem permissão para gerar atestado de frequência neste projeto";

const mocks = vi.hoisted(() => ({
  userId: 9,
  certificates: [] as Array<{
    id: number;
    userId: number;
    month: string;
    fileName: string;
    generatedBy: number | null;
    createdAt: string;
    updatedAt: string;
  }>,
  requests: [] as { method: string; path: string; body?: unknown }[],
  denyNextPost: false,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: mocks.userId, username: "marcio", roles: ["PESQUISADOR"] } }),
}));

interface MemberRow {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  roles: string[];
  joinedAt: string;
  situacao: string;
}

const MEMBERS: MemberRow[] = [
  { id: 1, userId: 9, userName: "Bento Lima", userEmail: null, roles: ["VOLUNTARIO"], joinedAt: "2026-02-01T00:00:00.000Z", situacao: "ATIVO" },
  { id: 2, userId: 10, userName: "Dina Raça", userEmail: null, roles: ["VOLUNTARIO"], joinedAt: "2026-02-01T00:00:00.000Z", situacao: "ATIVO" },
  { id: 3, userId: 11, userName: "Quem Saiu", userEmail: null, roles: ["VOLUNTARIO"], joinedAt: "2026-02-01T00:00:00.000Z", situacao: "INATIVO" },
];

function recordingFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input);
  const method = init?.method ?? "GET";
  mocks.requests.push({
    method,
    path,
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  });

  if (method === "GET" && path.includes("/members")) {
    return Promise.resolve(new Response(JSON.stringify({ members: MEMBERS }), { status: 200 }));
  }
  if (method === "GET") {
    return Promise.resolve(new Response(JSON.stringify({ certificates: mocks.certificates }), { status: 200 }));
  }
  if (method === "POST") {
    if (mocks.denyNextPost) {
      return Promise.resolve(new Response(JSON.stringify({ error: DENIED_MESSAGE }), { status: 403 }));
    }
    const body = (mocks.requests[mocks.requests.length - 1].body ?? {}) as { userId?: number; month?: string };
    const certificate = {
      id: 51,
      userId: body.userId ?? 0,
      month: body.month ?? "2026-09",
      fileName: `atestado-${body.month}-projeto.pdf`,
      generatedBy: mocks.userId,
      createdAt: "2026-10-19T12:00:00.000Z",
      updatedAt: "2026-10-19T12:00:00.000Z",
    };
    mocks.certificates.push(certificate);
    return Promise.resolve(new Response(JSON.stringify({ certificate }), { status: 201 }));
  }
  return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
}

function renderPanel(canManage: boolean) {
  return render(
    <div>
      <ProjectCertificatesPanel projectId={PROJECT} canManage={canManage} />
      <Toaster />
    </div>,
  );
}

beforeEach(() => {
  mocks.userId = 9;
  mocks.certificates = [];
  mocks.requests = [];
  mocks.denyNextPost = false;
  vi.stubGlobal("fetch", vi.fn(recordingFetch));
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectCertificatesPanel (V5-10b, DEC-171)", () => {
  it("lista só membro ATIVO e o mês default é o ANTERIOR ao de hoje (DEC-171)", async () => {
    renderPanel(true);

    expect(await screen.findByText("Bento Lima")).toBeInTheDocument();
    expect(screen.getByText("Dina Raça")).toBeInTheDocument();
    expect(screen.queryByText("Quem Saiu")).not.toBeInTheDocument();

    const previousMonth = new Date();
    previousMonth.setDate(1);
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const expected = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, "0")}`;
    expect(screen.getByLabelText("Mês de referência")).toHaveValue(expected);
  });

  it("gestão gera: POST com userId e mês, toast, e o download aparece", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel(true);

    await screen.findByText("Dina Raça");
    await user.click(screen.getByRole("button", { name: "Gerar atestado de Dina Raça" }));

    await waitFor(() =>
      expect(mocks.requests.some((r) => r.method === "POST" && r.path === `/api/projects/${PROJECT}/certificates`)).toBe(true),
    );
    const post = mocks.requests.find((r) => r.method === "POST")!;
    expect(post.body).toMatchObject({ userId: 10 });

    expect(await screen.findByText(/Atestado gerado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerar atestado de Dina Raça" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Baixar" })).toBeInTheDocument();
  });

  it("sem gestão: o botão aparece SÓ na própria linha (gate self OU gestão, DEC-171)", async () => {
    renderPanel(false);

    await screen.findByText("Dina Raça");
    // Linha do próprio usuário (id 9) tem botão; a do outro não.
    expect(screen.getByRole("button", { name: "Gerar atestado de Bento Lima" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar atestado de Dina Raça" })).not.toBeInTheDocument();
  });

  it("o 403 do servidor chega na tela com a frase do use case (DEC-90)", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.denyNextPost = true;
    renderPanel(true);

    await screen.findByText("Dina Raça");
    await user.click(screen.getByRole("button", { name: "Gerar atestado de Dina Raça" }));

    expect(await screen.findByText(DENIED_MESSAGE)).toBeInTheDocument();
  });

  it("certificado existente no mês mostra 'Regenerar' e o link de download na chegada", async () => {
    const month = new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() - 1);
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    mocks.certificates = [
      {
        id: 50,
        userId: 10,
        month: monthKey,
        fileName: `atestado-${monthKey}-projeto.pdf`,
        generatedBy: 9,
        createdAt: "2026-10-19T12:00:00.000Z",
        updatedAt: "2026-10-19T12:00:00.000Z",
      },
    ];

    renderPanel(true);

    expect(await screen.findByRole("button", { name: "Regenerar atestado de Dina Raça" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Baixar" });
    expect(link).toHaveAttribute("href", `/api/projects/${PROJECT}/certificates/50/file`);
    expect(link).toHaveAttribute("download");
  });
});
