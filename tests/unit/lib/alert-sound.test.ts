// @vitest-environment node
/**
 * plan-v3 OND2-C (DEC-36) — o som de pausa gerado por WebAudio.
 *
 * Roda em `environment node` porque é o ambiente sem `window`: é assim que se prova a
 * degradação fora do cliente. Para o lado do cliente, um `window` falso com `AudioContext`
 * duvê representa o navegador, o que permite contar osciladores e ler o envelope.
 *
 * O módulo mantém o contexto em cache; cada teste importa de novo (`vi.resetModules`) para
 * que o cache não vaze de um caso para o outro — assim o módulo de produção não ganha API
 * de teste só por causa disto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Recorded = {
  frequency: {
    value: number;
    setValueAtTime: (value: number, at: number) => void;
    linearRampToValueAtTime: (value: number, at: number) => void;
  };
  type: string;
  startedAt: number | null;
  stoppedAt: number | null;
};

function fakeAudioContext(options: { state?: AudioContextState; throwOnCreate?: boolean } = {}) {
  const calls = {
    contexts: 0,
    oscillators: [] as Recorded[],
    envelopes: [] as number[][],
    frequencyPoints: [] as number[][],
    connectsToDestination: 0,
    resumed: 0,
  };

  class FakeGain {
    points: number[] = [];
    gain = {
      setValueAtTime: (value: number) => void this.points.push(value),
      linearRampToValueAtTime: (value: number) => void this.points.push(value),
      exponentialRampToValueAtTime: (value: number) => void this.points.push(value),
    };
    connect(target: unknown) {
      if (target && (target as { __isDestination?: boolean }).__isDestination) {
        calls.connectsToDestination += 1;
      }
      return target;
    }
  }

  class FakeOscillator {
    type = "sine";
    points: number[] = [];
    frequency: Recorded["frequency"] = {
      value: 0,
      setValueAtTime: (value: number) => {
        this.frequency.value = value;
        this.points.push(value);
      },
      linearRampToValueAtTime: (value: number) => {
        this.frequency.value = value;
        this.points.push(value);
      },
    };
    startedAt: number | null = null;
    stoppedAt: number | null = null;
    constructor() {
      calls.oscillators.push(this as unknown as Recorded);
      calls.frequencyPoints.push(this.points);
    }
    connect(target: unknown) {
      return target;
    }
    start(at: number) {
      this.startedAt = at;
    }
    stop(at: number) {
      this.stoppedAt = at;
    }
  }

  class FakeAudioContext {
    state: AudioContextState = options.state ?? "running";
    currentTime = 10;
    destination = { __isDestination: true };
    constructor() {
      calls.contexts += 1;
      if (options.throwOnCreate) throw new Error("contexto indisponível");
    }
    createOscillator() {
      return new FakeOscillator();
    }
    createGain() {
      const gain = new FakeGain();
      calls.envelopes.push(gain.points);
      return gain;
    }
    resume() {
      calls.resumed += 1;
      return Promise.resolve();
    }
  }

  return { FakeAudioContext, calls };
}

async function loadModule() {
  vi.resetModules();
  return import("@/lib/notifications/alert-sound");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fora do cliente e sem WebAudio", () => {
  it("sem window: não suporta, não toca e não lança", async () => {
    const { isAlertSoundSupported, playAlertSound } = await loadModule();

    expect(typeof window).toBe("undefined");
    expect(isAlertSoundSupported()).toBe(false);
    expect(() => playAlertSound("pause")).not.toThrow();
    expect(playAlertSound("pause")).toBe(false);
  });

  it("window sem AudioContext nem webkitAudioContext: degrada em silêncio", async () => {
    vi.stubGlobal("window", {});
    const { isAlertSoundSupported, playAlertSound } = await loadModule();

    expect(isAlertSoundSupported()).toBe(false);
    expect(playAlertSound()).toBe(false);
  });

  it("contexto que lança na construção: devolve false, sem propagar", async () => {
    const { FakeAudioContext, calls } = fakeAudioContext({ throwOnCreate: true });
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound } = await loadModule();

    expect(playAlertSound()).toBe(false);
    expect(calls.contexts).toBe(1);
  });
});

describe("com WebAudio", () => {
  it("a pausa é um plim de uma nota que sobe e alonga", async () => {
    // Desenho pedido pelo dono em 2026-10-09: "mais chamativo, mais agudo e mais alongado,
    // sem virar alarme", no formato do plim do iPhone — uma nota só, alta, aguda e sustentada.
    // A subida de 1046 Hz (C6) a 1568 Hz (G6) no ataque é o caráter do toque.
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound, isAlertSoundSupported } = await loadModule();

    expect(isAlertSoundSupported()).toBe(true);
    expect(playAlertSound("pause")).toBe(true);

    expect(calls.oscillators).toHaveLength(2);
    expect(calls.frequencyPoints[0]).toEqual([1046, 1568]); // fundamental com deslize
    expect(calls.frequencyPoints[1]).toEqual([2093]); // harmônico fino, sem deslize
    expect(calls.oscillators[0].startedAt).toBe(10);
    expect(calls.oscillators[1].startedAt).toBe(10);
    // Alongado: o fundamental dura 550 ms, o harmônico 350 ms.
    expect((calls.oscillators[0].stoppedAt as number) - 10).toBeCloseTo(0.57, 5);
    expect((calls.oscillators[1].stoppedAt as number) - 10).toBeCloseTo(0.37, 5);
    for (const osc of calls.oscillators) {
      expect(osc.stoppedAt).not.toBeNull();
      expect(osc.stoppedAt as number).toBeGreaterThan(osc.startedAt as number);
    }
  });

  it("cada tom tem ataque e decaimento, e chega ao destino", async () => {
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound } = await loadModule();

    playAlertSound();

    expect(calls.envelopes).toHaveLength(2);
    for (const envelope of calls.envelopes) {
      expect(envelope).toHaveLength(3);
      expect(envelope[0]).toBeLessThan(0.001); // começa quase mudo (senão estala)
      expect(envelope[1]).toBeGreaterThan(0.01); // pico logo depois
      expect(envelope[2]).toBeLessThan(0.001); // volta a zero
    }
    expect(calls.connectsToDestination).toBe(2);
  });

  it("o som toca no talo (volume 1), por decisão do dono em 2026-10-09", async () => {
    // O dono mediu 0.16, 0.35 e 0.75 como "continuou baixo" e pediu volume máximo, com cada
    // pessoa ajustando o do próprio computador. O valor fica pinado.
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound } = await loadModule();

    playAlertSound("pause");

    expect(calls.envelopes[0][1]).toBeCloseTo(1, 5); // fundamental no talo
    expect(calls.envelopes[1][1]).toBeCloseTo(0.18, 5); // harmônico entra mais baixo
  });

  it("o som do quest é o toque antigo: dois bipes curtos e descendentes", async () => {
    // Pedido do dono: o som que era da pausa passa a ser o de notificação do quest. Fica
    // pinado para não se perder na troca.
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound } = await loadModule();

    expect(playAlertSound("quest")).toBe(true);

    expect(calls.frequencyPoints).toEqual([[660], [440]]);
    expect(calls.oscillators[0].startedAt).toBe(10);
    expect(calls.oscillators[1].startedAt).toBeCloseTo(10.2, 5);
    expect((calls.oscillators[0].stoppedAt as number) - 10).toBeCloseTo(0.18, 5);
    expect((calls.oscillators[1].stoppedAt as number) - 10).toBeCloseTo(0.52, 5);
  });

  it("som desconhecido cai no toque da pausa em vez de silenciar", async () => {
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound } = await loadModule();

    expect(playAlertSound("inexistente" as never)).toBe(true);
    expect(calls.frequencyPoints[0]).toEqual([1046, 1568]);
  });

  it("contexto suspenso (política de autoplay) é retomado antes de tocar", async () => {
    const { FakeAudioContext, calls } = fakeAudioContext({ state: "suspended" });
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound } = await loadModule();

    expect(playAlertSound()).toBe(true);
    expect(calls.resumed).toBe(1);
  });

  it("o contexto é reaproveitado entre chamadas — um por sessão, não um por pausa", async () => {
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound } = await loadModule();

    playAlertSound();
    playAlertSound();
    playAlertSound();

    expect(calls.contexts).toBe(1);
    expect(calls.oscillators).toHaveLength(6);
  });

  it("usa o prefixo antigo quando o navegador padronizar tarde (webkitAudioContext)", async () => {
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { webkitAudioContext: FakeAudioContext });
    const { isAlertSoundSupported, playAlertSound } = await loadModule();

    expect(isAlertSoundSupported()).toBe(true);
    expect(playAlertSound()).toBe(true);
    expect(calls.contexts).toBe(1);
  });
});