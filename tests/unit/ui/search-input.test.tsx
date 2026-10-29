import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchInput } from "@/components/ui/search-input";

/**
 * V6-1 · SearchInput (RF-V6.2).
 * Campo controlado, nome acessivel obrigatorio, sem debounce interno.
 */
describe("SearchInput (V6-1)", () => {
  it("tem nome acessivel a partir do aria-label", () => {
    render(<SearchInput value="" onValueChange={() => {}} ariaLabel="Buscar projetos" placeholder="Buscar projetos..." />);
    expect(screen.getByRole("searchbox", { name: "Buscar projetos" })).toBeInTheDocument();
  });

  it("devolve o texto digitado via onValueChange (harness controlado, como na tela)", async () => {
    const user = userEvent.setup({ delay: null });

    function Controlled({ onValueChange }: { onValueChange: (value: string) => void }) {
      const [value, setValue] = useState("");
      return (
        <SearchInput
          value={value}
          ariaLabel="Buscar projetos"
          onValueChange={(next) => {
            setValue(next);
            onValueChange(next);
          }}
        />
      );
    }

    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.type(screen.getByRole("searchbox"), "center");
    expect(onValueChange).toHaveBeenLastCalledWith("center");
    expect(screen.getByRole("searchbox")).toHaveValue("center");
  });

  it("mostra o valor controlado", () => {
    render(<SearchInput value="sigelab" onValueChange={() => {}} ariaLabel="Buscar projetos" />);
    expect(screen.getByRole("searchbox", { name: "Buscar projetos" })).toHaveValue("sigelab");
  });
});
