/**
 * Smoke test: proves the jsdom + RTL + vite-react plugin chain works end-to-end.
 * Not a behavior spec — real specs live beside their features (feature __tests__ folders).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

function Sample() {
  return <button type="button">Iniciar sessão</button>;
}

describe("test infrastructure", () => {
  it("renders and queries DOM through React Testing Library", () => {
    render(<Sample />);
    expect(screen.getByRole("button", { name: "Iniciar sessão" })).toBeInTheDocument();
  });
});
