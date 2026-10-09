// @vitest-environment node
/**
 * Os sons de alerta, agora arquivos MP3 em `public/sons/`.
 *
 * Roda em `environment node` porque é o ambiente sem `Audio`: é assim que se prova a
 * degradação fora do cliente. Para o lado do cliente, um `Audio` falso permite conferir o
 * caminho do arquivo, o `currentTime` zerado antes de tocar e o `play()` recusado sem
 * estourar.
 *
 * Histórico que estes testes carregam: até 2026-10-09 o som era sintetizado em WebAudio, e
 * o dono recusou as versões sintetizadas (volume baixo três vezes e um "plim" de oscilador).
 * A troca para arquivo gravado é a razão de o doble de áudio ser um `Audio` e não um
 * `AudioContext`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeAudio = {
  src: string;
  preload: string;
  currentTime: number;
  play: () => Promise<void>;
  played: number;
  zapped: number;
};

function fakeAudio(options: { reject?: boolean } = {}) {
  const created: FakeAudio[] = [];

  class Fake {
    src = "";
    preload = "";
    currentTime = 0;
    played = 0;
    zapped = 0;
    constructor(src?: string) {
      this.src = src ?? "";
      created.push(this as unknown as FakeAudio);
    }
    play() {
      this.played += 1;
      if (options.reject) return Promise.reject(new Error("autoplay bloqueado"));
      return Promise.resolve();
    }
  }

  return { Fake, created };
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

describe("som de alerta por arquivo", () => {
  it("sem Audio no ambiente: não suporta, não toca e não lança", async () => {
    const { isAlertSoundSupported, playAlertSound } = await loadModule();

    expect(typeof Audio).toBe("undefined");
    expect(isAlertSoundSupported()).toBe(false);
    expect(() => playAlertSound("pause")).not.toThrow();
    expect(playAlertSound("pause")).toBe(false);
    expect(playAlertSound("quest")).toBe(false);
  });

  it("toca o arquivo da pausa e o da notificação, cada um o seu", async () => {
    const { Fake, created } = fakeAudio();
    vi.stubGlobal("Audio", Fake);
    const { playAlertSound, isAlertSoundSupported } = await loadModule();

    expect(isAlertSoundSupported()).toBe(true);

    expect(playAlertSound("pause")).toBe(true);
    expect(playAlertSound("quest")).toBe(true);

    expect(created.map((a) => a.src)).toEqual(["/sons/pausa.mp3", "/sons/notificacao.mp3"]);
    expect(created.every((a) => a.preload === "auto")).toBe(true);
    expect(created.map((a) => a.played)).toEqual([1, 1]);
  });

  it("o elemento é reaproveitado: um por som, não um por toque", async () => {
    const { Fake, created } = fakeAudio();
    vi.stubGlobal("Audio", Fake);
    const { playAlertSound } = await loadModule();

    playAlertSound("pause");
    playAlertSound("pause");
    playAlertSound("pause");

    expect(created).toHaveLength(1);
    expect(created[0].played).toBe(3);
  });

  it("dois toques seguidos funcionam: o segundo zera o currentTime", async () => {
    // A pausa automática das 17h é frequentemente seguida de outra ação, e sem zerar o
    // `currentTime` o segundo pedido encontraria o arquivo ainda rolando e seria ignorado.
    const { Fake, created } = fakeAudio();
    vi.stubGlobal("Audio", Fake);
    const { playAlertSound } = await loadModule();

    playAlertSound("pause");
    created[0].currentTime = 0.4;
    playAlertSound("pause");

    expect(created[0].zapped).toBe(0);
    expect(created[0].currentTime).toBe(0);
    expect(created[0].played).toBe(2);
  });

  it("play() recusado pela política de autoplay devolve true sem lançar", async () => {
    // O toque é pedido antes de qualquer gesto na página, que é exatamente o caso da
    // política de autoplay. A promessa rejeitada não pode virar rejeição não tratada
    // (medido em outro lote: rejeição solta quebra o gate do vitest).
    const { Fake, created } = fakeAudio({ reject: true });
    vi.stubGlobal("Audio", Fake);
    const { playAlertSound } = await loadModule();

    expect(playAlertSound("pause")).toBe(true);
    expect(created[0].played).toBe(1);
  });

  it("construtor que lança devolve false, sem propagar", async () => {
    class Broken {
      constructor() {
        throw new Error("áudio indisponível");
      }
    }
    vi.stubGlobal("Audio", Broken);
    const { playAlertSound } = await loadModule();

    // Não toca, mas também não estoura: o caminho do construtor é protegido pelo try.
    expect(playAlertSound()).toBe(false);
    expect(() => playAlertSound()).not.toThrow();
  });

  it("os atalhos de pausa e de quest tocam os arquivos certos", async () => {
    const { Fake, created } = fakeAudio();
    vi.stubGlobal("Audio", Fake);
    const { playPauseSound, playQuestSound } = await loadModule();

    expect(playPauseSound()).toBe(true);
    expect(playQuestSound()).toBe(true);

    expect(created.map((a) => a.src)).toEqual(["/sons/pausa.mp3", "/sons/notificacao.mp3"]);
  });

  it("as chaves de preferência são uma por som", async () => {
    const { ALERT_SOUND_KEYS } = await loadModule();

    expect(ALERT_SOUND_KEYS.pause).toBe("dq:som-pausa");
    expect(ALERT_SOUND_KEYS.quest).toBe("dq:som-quest");
    expect(ALERT_SOUND_KEYS.pause).not.toBe(ALERT_SOUND_KEYS.quest);
  });
});
