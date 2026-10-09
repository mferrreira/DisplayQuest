/**
 * O som de notificação, no evento que atualiza o contador do sino.
 *
 * O dono pediu em 2026-10-09: "o som de notificação deve aparecer praticamente no evento
 * que atualizar o contador do ícone de notificação". Duas medições decidem o teste:
 *
 *  1. o contador NÃO era instantâneo. As consultas de `useNotifications` repetiam a cada
 *     60 s, então uma notificação nova levava até um minuto para aparecer no sino. A
 *     contagem passou a repetir a cada 5 s (`NOTIFICATION_POLL_MS`), que é o que faz o som
 *     ser utilizável. Este teste fixa o intervalo, porque o valor é a diferença entre som e
 *     surpresa.
 *  2. o som nasce da SUBIDA da contagem, não da primeira leitura. Sem isso, abrir a página
 *     com três não lidas tocaria o som três vezes, uma por nota antiga.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ unreadCount: 0, playAlertSound: vi.fn(() => true) }));

vi.mock("@/features/notifications", () => ({
  useNotifications: () => ({ unreadCount: mocks.unreadCount, notifications: [] }),
}));

vi.mock("@/lib/notifications/alert-sound", () => ({
  playAlertSound: mocks.playAlertSound,
}));

import {
  NOTIFICATION_POLL_MS,
  QUEST_SOUND_KEY,
  useNotificationSound,
} from "@/components/ui/use-notification-sound";

function Harness() {
  useNotificationSound();
  return null;
}

beforeEach(() => {
  // jsdom desta base não tem `window.localStorage` (medido em 2026-10-02): sem instalar o
  // próprio, o seam cai no caminho "sem storage", que é o comportamento de SSR e não o que
  // este teste quer exercitar.
  const data = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, String(value)),
      removeItem: (key: string) => void data.delete(key),
      clear: () => data.clear(),
      key: (index: number) => [...data.keys()][index] ?? null,
      get length() {
        return data.size;
      },
    },
  });

  mocks.unreadCount = 0;
  mocks.playAlertSound.mockClear();
  window.localStorage.removeItem(QUEST_SOUND_KEY);
});

afterEach(() => {
  // `delete` devolve o ambiente ao estado medido (sem localStorage).
  delete (window as unknown as Record<string, unknown>).localStorage;
});

describe("som de notificação", () => {
  it("o contador recarrega a cada 5 s, que é o que torna o som pontual", () => {
    // Medido: era 60 s. Um minuto de atraso faria o som chegar depois do sininho, e a
    // pessoa já teria visto a nota.
    expect(NOTIFICATION_POLL_MS).toBe(5_000);
  });

  it("a chave da preferência é própria, separada da do som da pausa", () => {
    expect(QUEST_SOUND_KEY).toBe("dq:som-quest");
  });

  it("a primeira leitura não toca, mesmo com não lidas na fila", () => {
    mocks.unreadCount = 3;

    act(() => {
      render(<Harness />);
    });

    expect(mocks.playAlertSound).not.toHaveBeenCalled();
  });

  it("a contagem subindo toca o som da notificação", () => {
    mocks.unreadCount = 0;
    const view = render(<Harness />);

    mocks.unreadCount = 1;
    view.rerender(<Harness />);

    expect(mocks.playAlertSound).toHaveBeenCalledTimes(1);
    expect(mocks.playAlertSound).toHaveBeenCalledWith("quest");
  });

  it("cada nota nova que chega toca de novo", () => {
    mocks.unreadCount = 0;
    const view = render(<Harness />);

    mocks.unreadCount = 1;
    view.rerender(<Harness />);
    mocks.unreadCount = 2;
    view.rerender(<Harness />);

    expect(mocks.playAlertSound).toHaveBeenCalledTimes(2);
  });

  it("a contagem caindo (a pessoa leu) não toca", () => {
    mocks.unreadCount = 4;
    const view = render(<Harness />);

    mocks.unreadCount = 2;
    view.rerender(<Harness />);

    expect(mocks.playAlertSound).not.toHaveBeenCalled();
  });

  it("com a preferência desligada, a subida não toca", () => {
    // A preferência é lida na montagem, então a chave precisa estar gravada ANTES do render.
    window.localStorage.setItem(QUEST_SOUND_KEY, JSON.stringify(false));
    mocks.unreadCount = 0;
    const view = render(<Harness />);

    mocks.unreadCount = 1;
    view.rerender(<Harness />);

    expect(mocks.playAlertSound).not.toHaveBeenCalled();
  });

  it("com a preferência explicitamente ligada, toca", () => {
    window.localStorage.setItem(QUEST_SOUND_KEY, JSON.stringify(true));
    mocks.unreadCount = 0;
    const view = render(<Harness />);

    mocks.unreadCount = 5;
    view.rerender(<Harness />);

    expect(mocks.playAlertSound).toHaveBeenCalledWith("quest");
  });
});
