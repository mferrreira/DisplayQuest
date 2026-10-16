/**
 * Feed "Atividade recente" — o que a tela mostra da linha de `history` achatada pela rota:
 * quem agiu, a frase da acao (criou / moveu para <status> / concluiu), o titulo e o tempo
 * relativo. Os dados vem do handler MSW de GET /api/tasks/activity (titulos distintos dos do
 * quadro, para nao colidir com os testes do board).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ActivityFeed } from "../components/activity-feed";

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityFeed />
    </QueryClientProvider>,
  );
}

describe("ActivityFeed", () => {
  it("mostra ator, frase da acao e titulo de cada linha", async () => {
    renderFeed();

    expect(await screen.findByText("Relatório semanal enviado")).toBeVisible();
    expect(screen.getByText("Onboarding do voluntário")).toBeVisible();
    expect(screen.getByText("Reunião de alinhamento")).toBeVisible();

    // ator aparece em cada linha (Guia em duas, Ana em uma)
    expect(screen.getAllByText("Guia da Silva")).toHaveLength(2);
    expect(screen.getByText("Ana Souza")).toBeVisible();
  });

  it("MOVE diz o status de destino em caixa de frase", async () => {
    renderFeed();
    expect(await screen.findByText("moveu para Em Revisão")).toBeVisible();
  });

  it("CREATE e COMPLETE usam a frase da acao", async () => {
    renderFeed();
    expect(await screen.findByText("concluiu")).toBeVisible();
    expect(screen.getByText("criou")).toBeVisible();
  });

  it("tempo relativo: agora / há 1 h / ontem", async () => {
    renderFeed();
    expect(await screen.findByText("agora")).toBeVisible();
    expect(screen.getByText("há 1 h")).toBeVisible();
    expect(screen.getByText("ontem")).toBeVisible();
  });
});
