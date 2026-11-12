/**
 * plan-v24 S01 — o formulário "Esqueci minha senha" na superfície pública.
 *
 * O que este arquivo fixa:
 *  - campos Email e Nova senha com os rótulos que a tela mostra;
 *  - validação no cliente: email obrigatório, senha com pelo menos 6 caracteres — as
 *    MESMAS mensagens do formulário de cadastro (R2);
 *  - sucesso: a tela mostra a mensagem neutra congelada (ADR-002, INV2) e o link para
 *    voltar ao login. Nenhuma variante da mensagem diz se o email existe.
 *
 * `fetch` é stubado: a página é pública, e o teste não depende de servidor.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PASSWORD_RESET_DUPLICATE_MESSAGE } from "@/backend/domain";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";

const NEUTRAL =
  "Se o email estiver cadastrado, a solicitação será analisada pela gestão. Você poderá entrar com a nova senha depois da aprovação.";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

let fetchCalls: Array<{ url: string; body: unknown }> = [];

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: { body?: string }) => {
      fetchCalls.push({ url: String(_url), body: options.body ? JSON.parse(options.body) : undefined });
      return jsonResponse(201, { message: NEUTRAL });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup({ delay: null });
  // `user.type` com string vazia explode no parser de teclado do userEvent; o campo já
  // nasce vazio, então só se digita o que existe.
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Nova senha"), password);
  await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
}

describe("formulário Esqueci minha senha", () => {
  it("tem título, Email, Nova senha e o botão de enviar", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("heading", { name: "Esqueci minha senha" })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Nova senha")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar solicitação" })).toBeTruthy();
  });

  it("email vazio: validação no campo, nenhuma requisição sai", async () => {
    render(<ForgotPasswordPage />);
    await fillAndSubmit("", "novasenha123");
    expect(await screen.findByText("Informe o email")).toBeTruthy();
    expect(fetchCalls).toHaveLength(0);
  });

  it("senha com menos de 6 caracteres: a mensagem do cadastro, nenhuma requisição sai", async () => {
    render(<ForgotPasswordPage />);
    await fillAndSubmit("x@lab.com", "123");
    expect(await screen.findByText("A senha deve ter pelo menos 6 caracteres")).toBeTruthy();
    expect(fetchCalls).toHaveLength(0);
  });

  it("envio aceito: mensagem neutra congelada + link para voltar ao login", async () => {
    render(<ForgotPasswordPage />);
    await fillAndSubmit("x@lab.com", "novasenha123");
    expect(await screen.findByText(NEUTRAL)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar ao login" })).toBeTruthy();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toEqual({ email: "x@lab.com", password: "novasenha123" });
  });

  it("a mensagem neutra não distingue email existente e inexistente (INV2)", async () => {
    // A rota responde 201 com a mesma mensagem nos dois casos; o formulário mostra a
    // resposta da rota. Este teste fixa que o texto do componente não contém a frase do
    // cadastro, que falaria "sua conta será analisada" e vazaria o caso existente.
    render(<ForgotPasswordPage />);
    await fillAndSubmit("x@lab.com", "novasenha123");
    const successText = (await screen.findByText(NEUTRAL)).textContent;
    expect(successText).toBe(NEUTRAL);
    expect(screen.queryByText(/conta criada/i)).toBeNull();
    expect(screen.queryByText(/sua conta será analisada/i)).toBeNull();
    await waitFor(() => expect(fetchCalls).toHaveLength(1));
  });

  it("enviando: o botão vira Enviando... e fica disabled até a resposta chegar", async () => {
    let release: (value: ReturnType<typeof jsonResponse>) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => {
      release = resolve;
    })));
    const user = userEvent.setup({ delay: null });
    render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "x@lab.com");
    await user.type(screen.getByLabelText("Nova senha"), "novasenha123");
    await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
    const busy = await screen.findByRole("button", { name: "Enviando..." });
    expect(busy).toBeDisabled();
    release(jsonResponse(201, { message: NEUTRAL }));
    expect(await screen.findByText(NEUTRAL)).toBeTruthy();
  });

  it("erro de rede: o aviso entra com role=alert e o formulário continua editável", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Falha na conexão");
    }));
    const user = userEvent.setup({ delay: null });
    render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "x@lab.com");
    await user.type(screen.getByLabelText("Nova senha"), "novasenha123");
    await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Falha na conexão");
    expect(screen.queryByText(NEUTRAL)).toBeNull();
    expect(screen.getByLabelText("Nova senha")).toBeTruthy();
  });

  it("recusa da rota (409): o alert mostra a frase congelada da rota, não uma cópia", async () => {
    // O aceite da rota fixa o 409; aqui se prova que a tela lê a resposta.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(409, { error: PASSWORD_RESET_DUPLICATE_MESSAGE })));
    const user = userEvent.setup({ delay: null });
    render(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "x@lab.com");
    await user.type(screen.getByLabelText("Nova senha"), "novasenha123");
    await user.click(screen.getByRole("button", { name: "Enviar solicitação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(PASSWORD_RESET_DUPLICATE_MESSAGE);
    expect(screen.queryByText(NEUTRAL)).toBeNull();
  });

  it("há link para o formulário na tela de login", async () => {
    const LoginPage = (await import("@/app/(auth)/login/page")).default;
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Esqueci minha senha" })).toBeTruthy();
  });
});
