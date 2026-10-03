/**
 * plan-v3 OND4-B (F4) — o chip do prêmio creditado no contador do cabeçalho.
 *
 * O que este arquivo segura:
 *  - o sinal (a loja em `lib/points-delta.ts`) só existe para delta de verdade: `null` (ninguém
 *    creditado) e `0` (o award já existia — DEC-48) não anunciam nada, porque um chip `+0`
 *    mentiria sobre uma entrega que não rendeu nada;
 *  - a contagem de 1 s é contável sem esperar um segundo de relógio: 20 passos de 50 ms;
 *  - `prefers-reduced-motion` mostra o valor final, sem contagem;
 *  - o chip some sozinho depois de ~1,9 s e limpa a loja — e um prêmio repetido (mesmo valor)
 *    anima de novo, porque o sinal é identificado por id, não por valor.
 *
 * Medido nesta base (2026-10-03): o jsdom do Vitest **não tem `window.matchMedia`**. Sem o stub
 * abaixo, a checagem cairia no caminho "sem suporte" — que trata como movimento reduzido e
 * mostraria o valor final, então o teste da contagem passaria por engano. Mesma armadilha do
 * `localStorage` (ver `features/tasks/__tests__/task-board.test.tsx`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { PointsDelta } from "@/components/ui/points-delta";
import {
  POINTS_DELTA_LIFETIME_MS,
  POINTS_DELTA_LINGER_MS,
  POINTS_DELTA_STEP_MS,
  POINTS_DELTA_STEPS,
  announcePointsDelta,
  currentPointsDelta,
  isLivePointsDelta,
  pointsDeltaLabel,
  pointsDeltaValueAt,
  resetPointsDeltaStore,
} from "@/lib/points-delta";

/** `matches` decidido pelo teste; cada caso instala o que precisa. */
function installMatchMedia(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/** Avança os timers dentro de `act`, senão o React ignora a atualização de estado. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** O texto visível do chip (o sufixo "pontos" é `sr-only` e não entra aqui). */
function chipText(): string | null {
  return screen.queryByTestId("points-delta")?.textContent?.replace(" pontos", "") ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPointsDeltaStore();
  installMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
  resetPointsDeltaStore();
  // `delete` devolve o ambiente ao estado medido (sem matchMedia).
  delete (window as unknown as Record<string, unknown>).matchMedia;
});

describe("lib/points-delta — só existe sinal para delta de verdade", () => {
  it("null e 0 não anunciam (ninguém creditado / o award já existia)", () => {
    expect(announcePointsDelta(null)).toBe(false);
    expect(announcePointsDelta(undefined)).toBe(false);
    expect(announcePointsDelta(0)).toBe(false);
    expect(announcePointsDelta(Number.NaN)).toBe(false);
    expect(currentPointsDelta()).toBeNull();
  });

  it("cada anúncio é um sinal novo, mesmo com o mesmo valor", () => {
    announcePointsDelta(10);
    const first = currentPointsDelta();
    announcePointsDelta(10);
    const second = currentPointsDelta();

    expect(first?.value).toBe(10);
    expect(second?.value).toBe(10);
    expect(second?.id).not.toBe(first?.id);
  });

  it("o sinal envelhece: passado o prazo ele não serve mais", () => {
    // O chip se desmonta junto com o cabeçalho e o `setTimeout` que limparia o sinal vai
    // junto — a marcação no tempo é o que impede o prêmio de uma sessão de reaparecer para
    // quem logar depois.
    announcePointsDelta(15, 1_000);
    const signal = currentPointsDelta()!;

    expect(isLivePointsDelta(signal, 1_000)).toBe(true);
    expect(isLivePointsDelta(signal, 1_000 + POINTS_DELTA_LIFETIME_MS)).toBe(true);
    expect(isLivePointsDelta(signal, 1_000 + POINTS_DELTA_LIFETIME_MS + 1)).toBe(false);
  });
});

describe("lib/points-delta — a contagem é pura", () => {
  it("20 passos de 50 ms = 1 s, do 0 ao valor final", () => {
    expect(pointsDeltaValueAt(15, 0)).toBe(0);
    expect(pointsDeltaValueAt(15, POINTS_DELTA_STEPS / 2)).toBe(8); // round(7.5)
    expect(pointsDeltaValueAt(15, POINTS_DELTA_STEPS)).toBe(15);
    // Passou do fim não volta nem estoura: o passo final é o próprio delta.
    expect(pointsDeltaValueAt(15, POINTS_DELTA_STEPS + 3)).toBe(15);
  });

  it("nunca mostra +0 nem −0 no meio da contagem", () => {
    //|round(-0.5)| no JavaScript é -0: sem arredondar a magnitude antes, um prêmio de 1 ponto
    // passaria meio segundo exibindo "-0", que não é um número que o servidor creditou.
    expect(pointsDeltaValueAt(-1, POINTS_DELTA_STEPS / 2)).toBe(-1);
    expect(pointsDeltaValueAt(1, 1)).toBe(1);
    expect(pointsDeltaLabel(pointsDeltaValueAt(-1, POINTS_DELTA_STEPS / 2))).toBe("−1");
  });

  it("contagem negativa desce até o valor (e o rótulo usa o sinal de menos tipográfico)", () => {
    expect(pointsDeltaValueAt(-20, 10)).toBe(-10);
    expect(pointsDeltaValueAt(-20, POINTS_DELTA_STEPS)).toBe(-20);
    expect(pointsDeltaLabel(-20)).toBe("−20");
    expect(pointsDeltaLabel(15)).toBe("+15");
  });
});

describe("PointsDelta — o chip do contador", () => {
  it("não renderiza nada antes de haver prêmio", () => {
    render(<PointsDelta />);

    expect(screen.queryByTestId("points-delta")).toBeNull();
  });

  it("conta de 0 até o valor em 1 s e para no valor final", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });
    // Antes do primeiro passo não há chip: um "+0" piscado mentiria sobre um prêmio que existe.
    expect(chipText()).toBeNull();

    advance(POINTS_DELTA_STEP_MS);
    expect(chipText()).toBe("+1");

    advance(POINTS_DELTA_STEP_MS * 9);
    expect(chipText()).toBe("+8"); // meio da contagem

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(chipText()).toBe("+15");
  });

  it("prêmio negativo sai em vermelho e conta para baixo", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(-20);
    });
    advance(POINTS_DELTA_STEP_MS);

    const chip = screen.getByTestId("points-delta");
    expect(chip.className).toContain("text-red-700");
    advance(POINTS_DELTA_STEP_MS * 9);
    expect(chipText()).toBe("−10");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(chipText()).toBe("−20");
  });

  it("some sozinho depois de mostrar o valor final, e a loja fica limpa", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(screen.getByTestId("points-delta")).toBeVisible();

    advance(POINTS_DELTA_LINGER_MS);
    expect(screen.queryByTestId("points-delta")).toBeNull();
    expect(currentPointsDelta()).toBeNull();
  });

  it("com prefers-reduced-motion mostra o valor final, sem contar", () => {
    installMatchMedia(true);
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });

    // Sem um único tick: o caminho reduzido entrega o valor final de imediato.
    expect(chipText()).toBe("+15");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(chipText()).toBe("+15");
  });

  it("prêmio repetido anima de novo (o sinal é por id, não por valor)", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS + POINTS_DELTA_LINGER_MS);
    expect(screen.queryByTestId("points-delta")).toBeNull();

    act(() => {
      announcePointsDelta(15);
    });
    advance(POINTS_DELTA_STEP_MS);
    expect(chipText()).toBe("+1"); // a contagem recomeça, não fica no 15
  });

  it("sinal de sessão antiga não ressuscita quando o chip remonta", () => {
    // O cabeçalho desmonta com o logout, e o timeout do sinal é cancelado junto; quem loga
    // depois não pode ver o prêmio de quem saiu.
    const first = render(<PointsDelta />);
    act(() => {
      announcePointsDelta(15);
    });
    advance(POINTS_DELTA_STEP_MS);
    expect(chipText()).toBe("+1");
    first.unmount();

    advance(POINTS_DELTA_LIFETIME_MS);
    render(<PointsDelta />);
    expect(screen.queryByTestId("points-delta")).toBeNull();
  });

  it("é anunciado para leitor de tela como 'mais 15 pontos'", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });
    advance(POINTS_DELTA_STEP_MS);

    const chip = screen.getByTestId("points-delta");
    expect(chip).toHaveAttribute("role", "status");
    expect(chip).toHaveTextContent("+1 pontos");
  });
});