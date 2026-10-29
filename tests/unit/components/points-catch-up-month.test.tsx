/**
 * plan-v9 S06 (MODELO R13, CA10) — o placar do mês re-tarifica na virada, sem animar a queda.
 *
 * O fechamento (S02) zera o placar de toda pessoa. Na primeira leitura depois dele, a pílula do
 * cabeçalho mostraria o valor guardado no navegador (120) contando até 0 — leitura em câmera
 * lenta de uma perda que NÃO é perda: o valor zera porque o mês virou, não porque alguém tirou
 * pontos.
 *
 * O contrato que este arquivo fecha:
 *  - a baseline mensal guarda o mês junto: `{ month, points }`, na chave própria
 *    `dq:month-points-seen:<id>` (a chave do saldo, `dq:points-seen:<id>`, continua intacta);
 *  - mês diferente do guardado (virada real, ou remount depois dela): o contador rende o valor
 *    novo direto, sem contagem e SEM chip (R13: "o chip não anuncia o reset como perda");
 *  - mesma sessão atravessando a virada: o mês novo chega por re-render, e a decisão não pode
 *    depender só da baseline lida na montagem;
 *  - mesmo mês: o catch-up de hoje continua valendo (anima e anuncia) — é o caso do prêmio
 *    creditado fora de mutação e do placar que desce dentro do próprio mês;
 *  - baseline negativa (R10: o placar vivo pode ser negativo) re-tarifica igual.
 *
 * O modo por saldo (`PointsCounter` sem `month`) segue congelado em `points-catch-up.test.tsx`;
 * este arquivo não toca nele.
 *
 * Medido nesta base (AGENTS.md): o jsdom do Vitest não tem `window.localStorage` nem
 * `window.matchMedia` — sem os stubs abaixo tudo cai no caminho "sem storage" (o caminho do SSR)
 * e o teste passaria provando o oposto do que pretende. `<StrictMode>` é o modo que o `next dev`
 * liga; sem ele a classe de bug do efeito que decide a animação a partir de um ref escrito por
 * ele mesmo passa verde no jsdom e trava no navegador.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";

import { PointsCounter, PointsDelta } from "@/components/ui/points-delta";
import {
  POINTS_DELTA_STEP_MS,
  POINTS_DELTA_STEPS,
  currentPointsDelta,
  resetPointsDeltaStore,
} from "@/lib/points-delta";
import {
  monthPointsSeenKey,
  readLastSeenMonthPoints,
  writeLastSeenMonthPoints,
} from "@/lib/points-seen";

/** Devolve o jsdom ao estado medido (sem storage) no `afterEach`. */
let storageMap: Map<string, string>;

function installLocalStorage() {
  storageMap = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
      setItem: (key: string, value: string) => {
        storageMap.set(key, String(value));
      },
      removeItem: (key: string) => {
        storageMap.delete(key);
      },
      clear: () => storageMap.clear(),
      key: (index: number) => [...storageMap.keys()][index] ?? null,
      get length() {
        return storageMap.size;
      },
    },
  });
}

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

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function totalText(): string | null {
  return screen.queryByTestId("points-total")?.textContent ?? null;
}

function chipText(): string | null {
  return screen.queryByTestId("points-delta")?.textContent?.replace(" pontos", "") ?? null;
}

/** Monta o par como o cabeçalho monta, no modo mensal, com o modo estrito do `next dev`. */
function renderMonthPair(points: number, month: string, userId: number | null) {
  return render(
    <StrictMode>
      <PointsCounter points={points} month={month} userId={userId} />
      <PointsDelta />
    </StrictMode>,
  );
}

function rerenderMonthPair(points: number, month: string, userId: number | null) {
  return (
    <StrictMode>
      <PointsCounter points={points} month={month} userId={userId} />
      <PointsDelta />
    </StrictMode>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPointsDeltaStore();
  installLocalStorage();
  installMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
  resetPointsDeltaStore();
  delete (window as unknown as Record<string, unknown>).localStorage;
  delete (window as unknown as Record<string, unknown>).matchMedia;
});

describe("lib/points-seen — a baseline do placar do mês guarda o mês", () => {
  it("guarda e devolve mês e valor por usuário", () => {
    writeLastSeenMonthPoints(7, "2026-10", 120);
    writeLastSeenMonthPoints(8, "2026-11", -5);
    expect(readLastSeenMonthPoints(7)).toEqual({ month: "2026-10", points: 120 });
    expect(readLastSeenMonthPoints(8)).toEqual({ month: "2026-11", points: -5 });
    expect(readLastSeenMonthPoints(9)).toBeNull();
  });

  it("userId inválido não produz chave compartilhada", () => {
    for (const bad of [null, undefined, 0, -3, Number.NaN]) {
      expect(readLastSeenMonthPoints(bad as number | null | undefined)).toBeNull();
      expect(writeLastSeenMonthPoints(bad as number | null | undefined, "2026-10", 10)).toBe(false);
    }
    expect(storageMap.size).toBe(0);
  });

  it("mês inválido não é guardado: sem mês a baseline não pode decidir virada", () => {
    expect(writeLastSeenMonthPoints(7, "26-10", 10)).toBe(false);
    expect(writeLastSeenMonthPoints(7, "2026-13", 10)).toBe(false);
    expect(writeLastSeenMonthPoints(7, "outubro", 10)).toBe(false);
    expect(storageMap.size).toBe(0);
  });

  it("valor corrompido não vira ponto de partida de contagem", () => {
    storageMap.set(monthPointsSeenKey(7), "não é json");
    expect(readLastSeenMonthPoints(7)).toBeNull();
    storageMap.set(monthPointsSeenKey(7), JSON.stringify(120));
    expect(readLastSeenMonthPoints(7)).toBeNull();
    storageMap.set(monthPointsSeenKey(7), JSON.stringify({ month: "26-10", points: 120 }));
    expect(readLastSeenMonthPoints(7)).toBeNull();
    storageMap.set(monthPointsSeenKey(7), JSON.stringify({ month: "2026-10", points: "120" }));
    expect(readLastSeenMonthPoints(7)).toBeNull();
  });
});

describe("PointsCounter mensal — re-tarificação na virada (CA10, R13)", () => {
  it("virada do mês: número direto, sem contagem, sem chip, e a baseline avança", () => {
    writeLastSeenMonthPoints(7, "2026-10", 120);

    renderMonthPair(0, "2026-11", 7);
    // O primeiro desenho já é o valor novo: a re-tarificação não tem câmera lenta.
    expect(totalText()).toBe("0");

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("0");
    expect(chipText()).toBeNull();
    expect(currentPointsDelta()).toBeNull();
    expect(readLastSeenMonthPoints(7)).toEqual({ month: "2026-11", points: 0 });
  });

  it("virada com placar negativo guardado: re-tarifica igual (R10)", () => {
    writeLastSeenMonthPoints(7, "2026-10", -30);

    renderMonthPair(0, "2026-11", 7);
    expect(totalText()).toBe("0");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("0");
    expect(chipText()).toBeNull();
  });

  it("fechamento manual fora do dia 1: o zero dentro do MESMO mês re-tarifica sem chip (R6, R13)", () => {
    // Medido no demo desta fatia: o gatilho do painel roda num dia qualquer e fecha o mês
    // ANTERIOR, zerando o placar do mês em curso. A régua do mês sozinha não vê virada nenhuma
    // aqui — e contaria a queda com um chip `−120`, que é o reset anunciado como perda.
    writeLastSeenMonthPoints(7, "2026-10", 120);

    renderMonthPair(0, "2026-10", 7);
    expect(totalText()).toBe("0");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("0");
    expect(chipText()).toBeNull();
    expect(currentPointsDelta()).toBeNull();
    expect(readLastSeenMonthPoints(7)).toEqual({ month: "2026-10", points: 0 });
  });

  it("mesma sessão atravessando a virada: mês novo por re-render re-tarifica sem animar", () => {
    // A decisão não pode depender só da baseline lida na montagem: aqui o contador já está
    // montado quando o mês chega pela sessão (o servidor re-nomeou o mês).
    writeLastSeenMonthPoints(7, "2026-10", 90);

    const view = renderMonthPair(90, "2026-10", 7);
    expect(totalText()).toBe("90");

    view.rerender(rerenderMonthPair(0, "2026-11", 7));
    // Sem contagem: o número muda de uma vez.
    expect(totalText()).toBe("0");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("0");
    expect(chipText()).toBeNull();
    expect(currentPointsDelta()).toBeNull();
    expect(readLastSeenMonthPoints(7)).toEqual({ month: "2026-11", points: 0 });
  });

  it("mesmo mês: o catch-up de hoje segue animando e anunciando", () => {
    writeLastSeenMonthPoints(7, "2026-11", 100);

    renderMonthPair(80, "2026-11", 7);
    // O primeiro desenho é o valor guardado: a contagem vai dele até o atual.
    expect(totalText()).toBe("100");
    advance(POINTS_DELTA_STEP_MS * 10);
    expect(totalText()).toBe("90");
    expect(chipText()).toBe("−20");

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("80");
    expect(readLastSeenMonthPoints(7)).toEqual({ month: "2026-11", points: 80 });
  });

  it("primeira visita do mês: mostra o total, não anima, grava a baseline do mês", () => {
    renderMonthPair(12, "2026-10", 7);
    expect(totalText()).toBe("12");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("12");
    expect(chipText()).toBeNull();
    expect(readLastSeenMonthPoints(7)).toEqual({ month: "2026-10", points: 12 });
  });

  it("a baseline de uma pessoa não entra na tela de outra", () => {
    writeLastSeenMonthPoints(7, "2026-10", 120);

    renderMonthPair(5, "2026-11", 8);
    expect(totalText()).toBe("5");
    expect(chipText()).toBeNull();
    expect(readLastSeenMonthPoints(8)).toEqual({ month: "2026-11", points: 5 });
  });

  it("remontar depois da virada não anima de novo nem mostra o valor velho", () => {
    writeLastSeenMonthPoints(7, "2026-10", 120);

    const first = renderMonthPair(0, "2026-11", 7);
    expect(totalText()).toBe("0");
    first.unmount();

    renderMonthPair(0, "2026-11", 7);
    expect(totalText()).toBe("0");
    expect(chipText()).toBeNull();
  });

  it("baseline corrompida não anima a partir de lixo", () => {
    storageMap.set(monthPointsSeenKey(7), "não é json");

    renderMonthPair(8, "2026-11", 7);
    expect(totalText()).toBe("8");
    expect(chipText()).toBeNull();
  });

  it("userId ausente (sessão a meio do carregamento): número direto, sem storage, sem quebrar", () => {
    renderMonthPair(6, "2026-11", null);
    expect(totalText()).toBe("6");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("6");
    expect(chipText()).toBeNull();
  });
});
