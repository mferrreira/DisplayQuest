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
  frequency: number | { value: number };
  type: string;
  startedAt: number | null;
  stoppedAt: number | null;
};

function fakeAudioContext(options: { state?: AudioContextState; throwOnCreate?: boolean } = {}) {
  const calls = {
    contexts: 0,
    oscillators: [] as Recorded[],
    envelopes: [] as number[][],
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
    frequency = { value: 0 };
    startedAt: number | null = null;
    stoppedAt: number | null = null;
    constructor() {
      calls.oscillators.push(this as unknown as Recorded);
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
  it("toca dois tons descendentes, o segundo depois do primeiro", async () => {
    const { FakeAudioContext, calls } = fakeAudioContext();
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    const { playAlertSound, isAlertSoundSupported } = await loadModule();

    expect(isAlertSoundSupported()).toBe(true);
    expect(playAlertSound("pause")).toBe(true);

    expect(calls.oscillators).toHaveLength(2);
    expect(calls.oscillators.map((o) => (o.frequency as { value: number }).value)).toEqual([660, 440]);
    expect(calls.oscillators[0].startedAt).toBe(10);
    expect(calls.oscillators[1].startedAt).toBeCloseTo(10.2, 5);
    // Todo tom para depois de começar — senão o oscilador fica ligado para sempre.
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