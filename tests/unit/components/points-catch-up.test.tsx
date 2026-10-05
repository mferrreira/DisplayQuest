/**
 * V4-3 (DEC-58) — a animação chega a quem não pode aprovar.
 *
 * O caso que o dono relatou, medido na causa: um voluntário com 0 pts conclui a tarefa, ela vai
 * para revisão, o líder aprova. O prêmio é creditado ao voluntário, mas na SESSÃO DO LÍDER — o
 * cliente do voluntário nunca recebeu o número, porque o sinal só nascia de mutação
 * (`features/tasks/hooks/use-tasks.ts:92`) e só quando `awardedTo === pessoa logada`. Ao voltar
 * ou dar refresh, apareciam os 10 sem contagem.
 *
 * O caminho é o baseline: o cabeçalho guarda o último total que AQUELE usuário viu naquele
 * navegador (`dq:points-seen:<userId>`, em `lib/points-seen.ts`) e, ao montar com um total
 * diferente, começa no valor guardado e conta até o atual.
 *
 * Medido nesta base (2026-10-02, registrado em AGENTS.md): o jsdom do Vitest **não tem
 * `window.localStorage`** — `window === globalThis` e o `populateGlobal` não copia a Web Storage.
 * Sem instalar o stub abaixo, tudo cai no caminho "sem storage", que é o caminho do SSR, e o
 * teste passaria por engano provando o oposto do que pretende. Mesma armadilha do `matchMedia`.
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
import { pointsSeenKey, readLastSeenPoints, writeLastSeenPoints } from "@/lib/points-seen";

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

/**
 * Monta o par como o cabeçalho monta (`app-header.tsx`): o contador e o chip lado a lado.
 * Sem o chip na árvore, afirmar que "não houve chip" é verdade por ausência de elemento, não
 * por comportamento — e é exatamente o tipo de asserção que passa provando nada.
 *
 * `<StrictMode>` não é enfeite: o `next dev` liga o modo estrito, e os testes de jsdom não
 * ligam por padrão. Foi a diferença que deixou escapar um bug que só o e2e pegou — o efeito que
 * decidia se animava a partir de um ref escrito por si mesmo era consumido pela primeira passada
 * e a segunda não animava nada. Com StrictMode aqui, a classe de bug é pega no jsdom.
 */
function renderCounterPair(points: number, userId: number | null) {
  return render(
    <StrictMode>
      <PointsCounter points={points} userId={userId} />
      <PointsDelta />
    </StrictMode>,
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

describe("lib/points-seen — a baseline é por pessoa", () => {
  it("userId inválido não produz chave compartilhada", () => {
    // `clientStorageKey` descarta null/undefined dos segmentos: sem a guarda,
    // `clientStorageKey("points-seen", null)` seria `dq:points-seen` — uma chave única para
    // todos os usuários, que faria uma pessoa animar a mudança de outra.
    for (const bad of [null, undefined, 0, -3, Number.NaN]) {
      expect(readLastSeenPoints(bad as number | null | undefined)).toBeNull();
      expect(writeLastSeenPoints(bad as number | null | undefined, 10)).toBe(false);
    }
    expect(storageMap.size).toBe(0);
  });

  it("guarda e devolve o total por usuário", () => {
    writeLastSeenPoints(7, 120);
    writeLastSeenPoints(8, 5);
    expect(readLastSeenPoints(7)).toBe(120);
    expect(readLastSeenPoints(8)).toBe(5);
    expect(readLastSeenPoints(9)).toBeNull();
  });

  it("valor corrompido não vira ponto de partida de contagem", () => {
    storageMap.set(pointsSeenKey(7), "não é json");
    expect(readLastSeenPoints(7)).toBeNull();
    storageMap.set(pointsSeenKey(7), JSON.stringify("120"));
    expect(readLastSeenPoints(7)).toBeNull();
  });
});

describe("PointsCounter — o catch-up de quem não aprovou (DEC-58)", () => {
  it("sem baseline: mostra o total, não anima, e grava o total para a próxima visita", () => {
    // Um usuário com 500 pts na primeira vez não pode ver contagem subindo do zero.
    renderCounterPair(500, 7);
    expect(totalText()).toBe("500");

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("500");
    expect(chipText()).toBeNull();
    expect(readLastSeenPoints(7)).toBe(500);
  });

  it("baseline 0 e total 10: começa em 0, conta até 10 e anuncia o chip", () => {
    writeLastSeenPoints(7, 0);

    renderCounterPair(10, 7);
    // O primeiro desenho já é o valor guardado, não o novo — sem isso a tela mostraria 10 e
    // depois saltaria para 0, que é o flash que `suppressHydrationWarning` existe para permitir.
    expect(totalText()).toBe("0");

    advance(POINTS_DELTA_STEP_MS);
    expect(totalText()).toBe("1");
    // O chip existe porque o catch-up anunciou um sinal: não houve mutação nenhuma por trás
    // desta mudança — foi um refresh.
    expect(chipText()).toBe("+10");

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("10");
    expect(readLastSeenPoints(7)).toBe(10);
  });

  it("perda creditada por outra pessoa também conta para baixo", () => {
    writeLastSeenPoints(7, 100);

    renderCounterPair(80, 7);
    advance(POINTS_DELTA_STEP_MS * 10);
    expect(totalText()).toBe("90");
    expect(chipText()).toBe("−20");

    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("80");
  });

  it("baseline igual ao total: nada de animação, nada de chip", () => {
    writeLastSeenPoints(7, 40);

    renderCounterPair(40, 7);
    expect(totalText()).toBe("40");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("40");
    expect(chipText()).toBeNull();
    expect(currentPointsDelta()).toBeNull();
  });

  it("a baseline de uma pessoa não anima a tela de outra", () => {
    writeLastSeenPoints(7, 0);

    // Usuário 8, que nunca viu nada nesta máquina: mostra o total direto.
    renderCounterPair(10, 8);
    expect(totalText()).toBe("10");
    expect(chipText()).toBeNull();
  });

  it("remontar depois de animar não anima de novo — a baseline avançou", () => {
    writeLastSeenPoints(7, 0);

    const first = renderCounterPair(10, 7);
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("10");
    first.unmount();

    resetPointsDeltaStore();
    renderCounterPair(10, 7);
    expect(totalText()).toBe("10");
    expect(chipText()).toBeNull();
  });

  it("com prefers-reduced-motion entrega o valor final e ainda assim grava a baseline", () => {
    installMatchMedia(true);
    writeLastSeenPoints(7, 0);

    renderCounterPair(10, 7);
    expect(totalText()).toBe("10");
    expect(readLastSeenPoints(7)).toBe(10);
  });

  it("sem storage utilizável (SSR, jsdom sem localStorage) não anima e não quebra", () => {
    delete (window as unknown as Record<string, unknown>).localStorage;

    renderCounterPair(10, 7);
    expect(totalText()).toBe("10");
    advance(POINTS_DELTA_STEP_MS * POINTS_DELTA_STEPS);
    expect(totalText()).toBe("10");
    expect(chipText()).toBeNull();
  });

  it("a baseline só avança quando a contagem termina: aba fechada no meio não come o resto", () => {
    writeLastSeenPoints(7, 0);

    const first = renderCounterPair(10, 7);
    advance(POINTS_DELTA_STEP_MS * 5);
    expect(totalText()).toBe("3");
    first.unmount();

    // A baseline continua 0: quem fecha a aba no meio da contagem vê a contagem de novo.
    expect(readLastSeenPoints(7)).toBe(0);
  });
});
