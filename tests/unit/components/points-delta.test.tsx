/**
 * O contador de pontos do cabeçalho: o total que conta (V4-2, DEC-59) e o chip que diz quanto.
 *
 * O que este arquivo segura:
 *  - o sinal (a loja em `lib/points-delta.ts`) só existe para delta de verdade: `null` (ninguém
 *    creditado) e `0` (o award já existia — DEC-48) não anunciam nada, porque um chip `+0`
 *    mentiria sobre uma entrega que não rendeu nada;
 *  - **quem conta gradualmente é o total do cabeçalho, não o chip** (DEC-59 — o pedido do dono:
 *    "o número aumentando gradativamente é o que fica no header, não o número da animação");
 *  - o chip mostra o valor final de imediato e percorre ~10px no eixo Y na direção do que
 *    aconteceu: para cima quando sobe, para baixo quando desce;
 *  - a contagem de 1 s é contável sem esperar um segundo de relógio: 20 passos de 50 ms;
 *  - `prefers-reduced-motion` mostra o valor final, sem contagem;
 *  - o chip some sozinho depois de ~1,9 s e limpa a loja — e um prêmio repetido (mesmo valor)
 *    reaparece, porque o sinal é identificado por id, não por valor.
 *
 * Medido nesta base (2026-10-03): o jsdom do Vitest **não tem `window.matchMedia`**. Sem o stub
 * abaixo, a checagem cairia no caminho "sem suporte" — que trata como movimento reduzido e
 * mostraria o valor final, então o teste da contagem passaria por engano. Mesma armadilha do
 * `localStorage` (ver `features/tasks/__tests__/task-board.test.tsx`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { PointsCounter, PointsDelta } from "@/components/ui/points-delta";
import {
  POINTS_DELTA_LIFETIME_MS,
  POINTS_DELTA_LINGER_MS,
  POINTS_DELTA_SHIFT_PX,
  POINTS_DELTA_STEP_MS,
  POINTS_DELTA_STEPS,
  announcePointsDelta,
  currentPointsDelta,
  isLivePointsDelta,
  pointsDeltaLabel,
  pointsDeltaMotionClasses,
  pointsTotalAt,
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

/** O número que o cabeçalho está mostrando neste instante. */
function totalText(): string | null {
  return screen.queryByTestId("points-total")?.textContent ?? null;
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

describe("lib/points-delta — a contagem do total é pura (V4-2)", () => {
  it("20 passos de 50 ms = 1 s, do total antigo ao novo", () => {
    expect(pointsTotalAt(100, 115, 0)).toBe(100);
    expect(pointsTotalAt(100, 115, POINTS_DELTA_STEPS / 2)).toBe(108); // round(7.5)
    expect(pointsTotalAt(100, 115, POINTS_DELTA_STEPS)).toBe(115);
    // Passou do fim não volta nem estoura: o passo final é o próprio destino.
    expect(pointsTotalAt(100, 115, POINTS_DELTA_STEPS + 3)).toBe(115);
  });

  it("contagem negativa desce até o valor", () => {
    expect(pointsTotalAt(100, 80, 10)).toBe(90);
    expect(pointsTotalAt(100, 80, POINTS_DELTA_STEPS)).toBe(80);
    // O arredondamento é da MAGNITUDE, e não do deslocamento assinado: `Math.round(-0.5)` é `-0`
    // no JavaScript, e `100 + -0` renderizaria `100` por acaso — mas `100 + (-1)` viria de um
    // `-0` em outro passo. Medido: com delta −1, o passo 10 de 20 é 99, não 100.
    expect(pointsTotalAt(100, 99, POINTS_DELTA_STEPS / 2)).toBe(99);
  });

  it("delta pequeno segura o total antigo e salta — não inventa fração", () => {
    // Diferente do chip antigo, que nunca podia mostrar `+0`: aqui segurar o valor antigo nos
    // primeiros passos é dizer a verdade sobre o total que ainda é o total.
    expect(pointsTotalAt(10, 11, 1)).toBe(10);
    expect(pointsTotalAt(10, 11, POINTS_DELTA_STEPS / 2)).toBe(11);
  });

  it("from igual a to não produz movimento", () => {
    expect(pointsTotalAt(50, 50, 5)).toBe(50);
  });
});

describe("lib/points-delta — a direção do movimento em Y", () => {
  it("sobe quando o número sobe, desce quando o número desce", () => {
    expect(pointsDeltaMotionClasses(15)).toContain("slide-in-from-bottom");
    expect(pointsDeltaMotionClasses(-20)).toContain("slide-in-from-top");
  });

  it("o percurso é o valor nomeado, em pixels, nas duas direções", () => {
    expect(POINTS_DELTA_SHIFT_PX).toBe(10);
    expect(pointsDeltaMotionClasses(15)).toContain(`${POINTS_DELTA_SHIFT_PX}px`);
    expect(pointsDeltaMotionClasses(-20)).toContain(`${POINTS_DELTA_SHIFT_PX}px`);
  });
});

describe("PointsCounter — o número do cabeçalho é quem conta (DEC-59)", () => {
  it("o primeiro desenho é o total, sem contagem a partir de zero", () => {
    // Um usuário com 500 pts não pode ver contagem subindo do zero ao abrir o sistema.
    render(<PointsCounter points={500} />);
    expect(totalText()).toBe("500");

    advance(POINTS_DELTA_STEP_MS);
    expect(totalText()).toBe("500");
  });

  it("total que muda conta do valor antigo até o novo, em 1 s", () => {
    const { rerender } = render(<PointsCounter points={100} />);

    rerender(<PointsCounter points={110} />);
    advance(POINTS_DELTA_STEP_MS);
    expect(totalText()).toBe("101");

    advance(POINTS_DELTA_STEP_MS * 9);
    expect(totalText()).toBe("105"); // meio da contagem

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("110");
  });

  it("perda de pontos conta para baixo (DEC-39: penalidade sem piso)", () => {
    const { rerender } = render(<PointsCounter points={100} />);

    rerender(<PointsCounter points={80} />);
    advance(POINTS_DELTA_STEP_MS * 10);
    expect(totalText()).toBe("90");

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("80");
  });

  it("total que não muda não anima", () => {
    const { rerender } = render(<PointsCounter points={100} />);
    rerender(<PointsCounter points={100} />);
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("100");
  });

  it("com prefers-reduced-motion entrega o valor final, sem contagem", () => {
    installMatchMedia(true);
    const { rerender } = render(<PointsCounter points={100} />);

    rerender(<PointsCounter points={115} />);
    // Sem um único tick: o caminho reduzido já entrega o destino.
    expect(totalText()).toBe("115");
  });

  it("dois aumentos em sequência contam a partir de onde pararam, não do começo", () => {
    const { rerender } = render(<PointsCounter points={100} />);

    rerender(<PointsCounter points={110} />);
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("110");

    rerender(<PointsCounter points={120} />);
    advance(POINTS_DELTA_STEP_MS);
    expect(totalText()).toBe("111");
  });
});

describe("PointsDelta — o chip diz quanto, e para que lado", () => {
  it("não renderiza nada antes de haver prêmio", () => {
    render(<PointsDelta />);

    expect(screen.queryByTestId("points-delta")).toBeNull();
  });

  it("mostra o valor final de imediato — quem conta é o cabeçalho (DEC-59)", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });
    // Antes, o chip contava: "+1" no primeiro passo, "+8" no meio, "+15" no fim. A contagem
    // foi para o total; o chip é a legenda e chega inteira.
    expect(chipText()).toBe("+15");

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(chipText()).toBe("+15");
  });

  it("prêmio negativo sai em vermelho e entra pelo topo", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(-20);
    });

    const chip = screen.getByTestId("points-delta");
    expect(chip.className).toContain("text-red-700");
    expect(chip.className).toContain("slide-in-from-top");
    expect(chipText()).toBe("−20");
  });

  it("prêmio positivo entra por baixo", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });

    expect(screen.getByTestId("points-delta").className).toContain("slide-in-from-bottom");
  });

  it("some sozinho depois de ~1,9 s, e a loja fica limpa", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });
    advance(POINTS_DELTA_LIFETIME_MS);
    expect(screen.queryByTestId("points-delta")).toBeNull();
    expect(currentPointsDelta()).toBeNull();
  });

  it("prêmio repetido reaparece (o sinal é por id, não por valor)", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });
    advance(POINTS_DELTA_LIFETIME_MS);
    expect(screen.queryByTestId("points-delta")).toBeNull();

    act(() => {
      announcePointsDelta(15);
    });
    expect(chipText()).toBe("+15");
  });

  it("sinal de sessão antiga não ressuscita quando o chip remonta", () => {
    // O cabeçalho desmonta com o logout, e o timeout do sinal é cancelado junto; quem loga
    // depois não pode ver o prêmio de quem saiu.
    const first = render(<PointsDelta />);
    act(() => {
      announcePointsDelta(15);
    });
    expect(chipText()).toBe("+15");
    first.unmount();

    // `+ 1` porque a vida útil é inclusiva na borda (`now - at <= LIFETIME`): avançar exatamente o
    // prazo ainda deixa o sinal vivo, e o teste passaria por sorte se o prazo fosse exclusivo.
    advance(POINTS_DELTA_LIFETIME_MS + 1);
    render(<PointsDelta />);
    expect(screen.queryByTestId("points-delta")).toBeNull();
  });

  it("é anunciado para leitor de tela como 'mais 15 pontos'", () => {
    render(<PointsDelta />);

    act(() => {
      announcePointsDelta(15);
    });

    const chip = screen.getByTestId("points-delta");
    expect(chip).toHaveAttribute("role", "status");
    expect(chip).toHaveTextContent("+15 pontos");
  });
});
