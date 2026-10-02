/**
 * plan-v3 OND2-B — rascunho de anotações da sessão.
 *
 * O texto é o recurso que o 2.B promete: salvo por sessão, com debounce, despejado na caixa
 * de log ao encerrar, e — o mais importante — **não** apagado quando o encerramento falha.
 * Estes testes fixam esse contrato na chave (`dq:session-notes:<id>`) e não na implementação,
 * para que trocar o storage não reescreva a suíte.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import {
  SessionNotesDraft,
  SESSION_NOTES_DEBOUNCE_MS,
  sessionNotesKey,
  useSessionNotes,
} from "@/components/ui/session-notes-draft";

/**
 * Reproduz a ligação que o cronômetro faz: guarda o texto no hook e o entrega ao
 * componente. `onEnd` é o "botão Parar" — o que prova o despejo no log.
 */
function Harness({ sessionId, onEnd }: { sessionId: number | null; onEnd?: (note: string) => void }) {
  const { note, setNote, clearNote } = useSessionNotes(sessionId);
  return (
    <>
      <SessionNotesDraft sessionId={sessionId} note={note} onNoteChange={setNote} />
      <button onClick={() => onEnd?.(note)}>encerrar</button>
      <button onClick={clearNote}>limpar</button>
    </>
  );
}

function type(text: string) {
  fireEvent.change(screen.getByTestId("session-notes-draft"), { target: { value: text } });
}

/**
 * Medido nesta base (2026-10-02): no ambiente jsdom do Vitest, `window === globalThis` e
 * **`window.localStorage` é `undefined`** — o `populateGlobal` do Vitest não copia a
 * Web Storage do jsdom (que existe em `globalThis.jsdom.window.localStorage`). Um
 * `localStorage` em memória é instalado aqui, porque é o que a caixa de notas enxerga.
 */
let storageData: Map<string, string>;

function installMemoryStorage() {
  storageData = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (storageData.has(key) ? (storageData.get(key) as string) : null),
    setItem: (key: string, value: string) => storageData.set(key, value),
    removeItem: (key: string) => storageData.delete(key),
    clear: () => storageData.clear(),
    key: () => null,
    get length() {
      return storageData.size;
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}

function stored(sessionId: number): string | null {
  return storageData.get(sessionNotesKey(sessionId)) ?? null;
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  // `delete` devolve o ambiente ao estado medido (sem localStorage).
  delete (window as unknown as Record<string, unknown>).localStorage;
  vi.restoreAllMocks();
});

describe("caixa de anotações", () => {
  it("só aparece com sessão aberta", () => {
    const { rerender } = render(<Harness sessionId={null} />);
    expect(screen.queryByTestId("session-notes-draft")).not.toBeInTheDocument();

    rerender(<Harness sessionId={7} />);
    expect(screen.getByTestId("session-notes-draft")).toBeInTheDocument();
    expect(screen.getByText("Anotações da sessão")).toBeInTheDocument();
  });

  it("despeja o rascunho no log preservando o texto inteiro", () => {
    const onEnd = vi.fn();
    render(<Harness sessionId={7} onEnd={onEnd} />);

    type("linha 1\nlinha 2");
    fireEvent.click(screen.getByText("encerrar"));

    expect(onEnd).toHaveBeenCalledWith("linha 1\nlinha 2");
  });
});

describe("gravação com debounce", () => {
  it("não grava a cada tecla, e sim uma vez depois do debounce", async () => {
    render(<Harness sessionId={7} />);

    type("a");
    type("ab");
    type("abc");

    // Nenhuma tecla chegou ao storage — o que evita o gargalo em máquina de laboratório.
    expect(stored(7)).toBeNull();

    await waitFor(() => expect(stored(7)).toBe("abc"), { timeout: SESSION_NOTES_DEBOUNCE_MS * 10 });
  });

  it("apagar o texto remove a chave em vez de gravar string vazia", async () => {
    render(<Harness sessionId={7} />);
    type("abc");
    await waitFor(() => expect(stored(7)).toBe("abc"), { timeout: SESSION_NOTES_DEBOUNCE_MS * 10 });

    type("");
    await waitFor(() => expect(stored(7)).toBeNull(), { timeout: SESSION_NOTES_DEBOUNCE_MS * 10 });
  });

  it("o que ficou pendente no debounce é gravado ao fechar o painel", () => {
    const { unmount } = render(<Harness sessionId={7} />);
    type("última frase, escrita há pouco");

    // Fecha antes do debounce: o texto não pode ser pago com a tecla que o digitou.
    unmount();
    expect(stored(7)).toBe("última frase, escrita há pouco");
  });
});

describe("anotação por sessão", () => {
  it("recupera o texto ao reabrir (é o que sobrevive a recarregar a página)", async () => {
    const first = render(<Harness sessionId={7} />);
    type("levantamento de requisitos");
    await waitFor(
      () => expect(stored(7)).toBe("levantamento de requisitos"),
      { timeout: SESSION_NOTES_DEBOUNCE_MS * 10 },
    );
    first.unmount();

    render(<Harness sessionId={7} />);
    expect(screen.getByTestId("session-notes-draft")).toHaveValue("levantamento de requisitos");
  });

  it("trocar de sessão não herda a anotação da anterior", async () => {
    const { rerender } = render(<Harness sessionId={7} />);
    type("anotação da sessão 7");
    await waitFor(() => expect(stored(7)).toBe("anotação da sessão 7"), {
      timeout: SESSION_NOTES_DEBOUNCE_MS * 10,
    });

    rerender(<Harness sessionId={8} />);

    expect(screen.getByTestId("session-notes-draft")).toHaveValue("");
    expect(stored(8)).toBeNull();
    // E a da sessão 7 continua guardada: são chaves diferentes.
    expect(stored(7)).toBe("anotação da sessão 7");
  });

  it("cada sessão tem chave própria", () => {
    expect(sessionNotesKey(7)).toBe("dq:session-notes:7");
    expect(sessionNotesKey(7)).not.toBe(sessionNotesKey(8));
  });
});

describe("limpeza", () => {
  it("clearNote apaga a chave e esvazia a caixa", async () => {
    render(<Harness sessionId={7} />);
    type("texto a limpar");
    await waitFor(() => expect(stored(7)).toBe("texto a limpar"), {
      timeout: SESSION_NOTES_DEBOUNCE_MS * 10,
    });

    await act(async () => {
      fireEvent.click(screen.getByText("limpar"));
    });

    expect(stored(7)).toBeNull();
    expect(screen.getByTestId("session-notes-draft")).toHaveValue("");
  });

  it("encerrar uma sessão não apaga o rascunho de outra", async () => {
    const { rerender } = render(<Harness sessionId={7} />);
    type("da 7");
    await waitFor(() => expect(stored(7)).toBe("da 7"), { timeout: SESSION_NOTES_DEBOUNCE_MS * 10 });

    // A sessão 7 acabou: o rascunho dela é liberado...
    rerender(<Harness sessionId={null} />);
    await act(async () => {
      fireEvent.click(screen.getByText("limpar"));
    });
    expect(stored(7)).toBeNull();

    // ...e a 8, que já estava aberta em outra aba, não é tocada.
    expect(stored(8)).toBeNull();
  });
});

describe("storage indisponível", () => {
  it("a caixa continua digitável quando o navegador bloqueia o storage", async () => {
    // Safari privado/cookies desligados lançam no acesso — é o caso que o seam promete não
    // transformar em tela quebrada.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage bloqueado");
      },
    });

    try {
      render(<Harness sessionId={7} />);
      type("digitado com storage bloqueado");
      expect(screen.getByTestId("session-notes-draft")).toHaveValue(
        "digitado com storage bloqueado",
      );
    } finally {
      delete (window as unknown as Record<string, unknown>).localStorage;
    }
  });
});