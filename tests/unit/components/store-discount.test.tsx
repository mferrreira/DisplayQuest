/**
 * plan-v15 S08 (R14, tela) — o preço efetivo na loja.
 *
 * O que este arquivo trava: com bônus equipado a tela mostra o preço cobrado e risca o preço
 * da tabela; sem desconto, só o preço; com desconto de 100%, o piso 1 aparece.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StorePrice } from "@/components/ui/store-price";

describe("StorePrice com desconto de passiva", () => {
  it("sem desconto: só o preço da tabela", () => {
    render(<StorePrice price={100} effects={[]} />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.queryByTestId("store-price")).not.toBeInTheDocument();
  });

  it("+10%: mostra 90 com o preço de 100 riscado", () => {
    render(<StorePrice price={100} effects={[{ kind: "bonus", pct: 0.1 }]} />);
    const chip = screen.getByTestId("store-price");
    expect(chip).toHaveTextContent("90");
    expect(chip).toHaveTextContent("de 100");
  });

  it("desconto de 100%: o piso 1 aparece, nunca o preço zero", () => {
    render(<StorePrice price={5} effects={[{ kind: "bonus", pct: 1 }]} />);
    const chip = screen.getByTestId("store-price");
    expect(chip).toHaveTextContent("1");
    expect(chip).toHaveTextContent("de 5");
    expect(chip).not.toHaveTextContent("0");
  });
});
