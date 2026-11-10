/**
 * S03 (plan-v11, R3, ADR-001) — o logout cai no login do host em uso.
 *
 * Mede dois mecanismos recusados e um aceito:
 *  - `callbackUrl` absoluta: o NextAuth valida contra o host de NEXTAUTH_URL e recusa host
 *    divergente — acessando por IP, o usuário caía em localhost (o bug);
 *  - `pages.signOut` no config: medida em 2026-10-29 contra o dev server em 127.0.0.1 — a rota
 *    de signOut é resolvida contra NEXTAUTH_URL, o landing também foi localhost. Não serve;
 *  - aceito: `signOut({ redirect: false })` limpa a sessão e o CLIENTE navega para `/login`
 *    relativo, que é o host da requisição. Este arquivo congela exatamente isso.
 *
 * Costura medida: o stub de `window.location` substitui o `Location` do jsdom, cujo setter de
 * `href` dispara "Not implemented: navigation". Arquivo `.tsx` porque o probe é JSX.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nextauth = vi.hoisted(() => ({
  signOut: vi.fn(),
  signIn: vi.fn(),
  session: { user: { id: 1, name: "Ana", email: "ana@lab", roles: ["VOLUNTARIO"], points: 0 } },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: nextauth.session, status: "authenticated" }),
  signOut: nextauth.signOut,
  signIn: nextauth.signIn,
}));

import { useAuth } from "@/contexts/auth-context";

function Probe() {
  const { logout } = useAuth();
  return <button onClick={logout}>Sair</button>;
}

const hrefs: string[] = [];

describe("S03 — logout termina no login do host em uso", () => {
  beforeEach(() => {
    hrefs.length = 0;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        set href(u: string) {
          hrefs.push(u);
        },
        assign(u: string) {
          hrefs.push(u);
        },
      },
    });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).location;
    nextauth.signOut.mockClear();
  });

  it("logout() chama signOut com redirect:false e sem callbackUrl", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Probe />);
    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(nextauth.signOut).toHaveBeenCalledTimes(1);
    const arg = nextauth.signOut.mock.calls[0][0] as Record<string, unknown> | undefined;
    expect(arg?.redirect).toBe(false);
    expect(arg?.callbackUrl).toBeUndefined();
  });

  it("depois do signOut, a navegação vai para o /login RELATIVO (host da requisição)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Probe />);
    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(hrefs).toEqual(["/login"]);
  });
});
