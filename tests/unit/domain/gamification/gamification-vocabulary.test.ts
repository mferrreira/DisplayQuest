// @vitest-environment node
/**
 * plan-v8 V8-7 (DEC-220) — guarda do vocabulário e dos ícones de engajamento.
 *
 * O vocabulário novo ("troféu" na tela, troféu equipável, placar do MÊS) é decisão de produto, e a
 * casa já mediu duas vezes que vocabulário solto em cópia vira duas réguas: DEC-95/96 (o status
 * `inactive` e o filtro morto na tela de voluntários) e DEC-90 (mock reimplementando regra). Esta
 * fechadura lê o código de produção e congela três coisas:
 *
 *   1. as frases que diziam "badge" na tela não voltam — a lista é medida (as strings que existiam
 *      antes da onda, não um padrão genérico), porque o código continua falando `badge` nos
 *      identificadores: a tabela é `badges`, o componente é `BadgeManager`, a API é `BadgesAPI`. O que
 *      mudou é o que a pessoa lê.
 *   2. a superfície de troféus é UMA: `components/ui/user-trophies.tsx`. A antiga (`user-badges.tsx`)
 *      foi apagada — medida, ela filtrava as linhas de conquista que não vinham com o catálogo e,
 *      portanto, não mostrava nada. Um segundo leitor da mesma leitura é o modo de falha que a casa
 *      fecha por teste.
 *   3. o ícone do PLACAR é o raio (`Zap`); o `Trophy` fica só nas superfícies de troféu (ASK-V8-23).
 *      Os quatro arquivos do placar (header, menu móvel, item de navegação, página do quadro) são
 *      conferidos um por um: nenhum deles menciona `Trophy`.
 *
 * Também congelado: a trilha do mês não se chama "acumulados" (a palavra descrevia a trilha vitalícia
 * que o plan-v8 desmembrou), e o elo do quadro é lido do XP (a coluna `users.elo` não entra no adaptador
 * do ranking — conferido em `trophy-window-guard.test.ts`).
 *
 * Roda em ambiente `node` porque lê arquivo do disco.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/**
 * O texto que a pessoa pode ler: comentários fora. Uma decisão fechada pode NOMEAR a palavra que
 * saiu para explicar por que saiu (é o que o docstring do cartão de temporada faz com "acumulados"),
 * e a fechadura é do que está na tela, não do que o arquivo conta sobre si mesmo.
 */
function readProse(relativePath: string): string {
  return read(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const SHELF = "components/ui/user-trophies.tsx";
const OLD_SHELF = "components/ui/user-badges.tsx";
const SEASON_CARD = "components/ui/season-card.tsx";
const CYCLE_HISTORY = "components/ui/cycle-history.tsx";
const BADGE_PANEL = "components/admin/badge-manager.tsx";
const ADMIN_PANEL = "components/admin/ModernAdminPanel.tsx";
const PROFILE_PAGE = "app/(dashboard)/dashboard/profile/page.tsx";
const PROFILE_VIEW = "components/ui/user-profile-view.tsx";
const RANKING_PAGE = "app/(dashboard)/dashboard/leaderboard/page.tsx";
const HEADER = "components/layout/app-header.tsx";
const MOBILE_MENU = "components/layout/mobile-menu.tsx";
const NAV_CONFIG = "components/layout/nav-config.ts";

/** As frases de tela que existiam antes da onda e não voltam (medidas nos arquivos renomeados). */
const RETIRED_PHRASES = [
  "Gerenciar Badges",
  "Crie e gerencie badges",
  "Novo Badge",
  "Editar Badge",
  "Criar Novo Badge",
  "Nome do Badge",
  "Badge ativo",
  "Descreva o que este badge",
  "excluir este badge",
  "Nenhum badge conquistado",
  "Erro ao carregar badges",
  ">Badges<",
  "Badges ({",
] as const;

describe("o vocabulário de tela do troféu (MODELO §1)", () => {
  it("as frases renomeadas não voltam", () => {
    const sources = [SHELF, BADGE_PANEL, ADMIN_PANEL, PROFILE_VIEW].map(read).join("\n");
    for (const phrase of RETIRED_PHRASES) {
      expect(sources, `a frase "${phrase}" voltou à tela`).not.toContain(phrase);
    }
  });

  it("as superfícies de troféu dizem troféu", () => {
    expect(read(SHELF)).toContain("Troféus");
    expect(read(BADGE_PANEL)).toContain("Gerenciar Troféus");
    expect(read(ADMIN_PANEL)).toContain("Troféus");
  });

  it("o código continua falando `badge` onde é o nome da tabela e do componente", () => {
    // A onda é de tela: `badges` é a tabela, `BadgeManager` o componente, `BadgesAPI` o cliente.
    expect(read(BADGE_PANEL)).toContain("BadgesAPI");
    expect(read(ADMIN_PANEL)).toContain('value="badges"');
  });
});

describe("a superfície de troféus é uma só", () => {
  it("a leitura antiga de conquistas sem catálogo foi apagada e não volta", () => {
    expect(existsSync(path.join(REPO_ROOT, OLD_SHELF))).toBe(false);
  });

  it("nenhum production import aponta para a superfície apagada", () => {
    const importers = [PROFILE_PAGE, PROFILE_VIEW, "components/ui/user-search.tsx"];
    for (const file of importers) {
      expect(read(file)).not.toContain("@/components/ui/user-badges");
    }
    expect(read(PROFILE_VIEW)).toContain("@/components/ui/user-trophies");
    expect(read(PROFILE_PAGE)).toContain("@/components/ui/user-trophies");
  });

  it("o perfil próprio tem cartão de temporada, prateleira e histórico", () => {
    const page = read(PROFILE_PAGE);
    expect(page).toContain("@/components/ui/season-card");
    expect(page).toContain("@/components/ui/cycle-history");
    // A leitura do histórico é UMA busca, distribuída para a prateleira (campeão) e para o histórico.
    expect(page.match(/GamificationAPI\.getCycleHistory/g)?.length).toBe(1);
  });
});

describe("o placar tem o ícone do placar, e o troféu tem o do troféu (ASK-V8-23)", () => {
  const BOARD_FILES = [HEADER, MOBILE_MENU, NAV_CONFIG, RANKING_PAGE];

  it("nenhum arquivo do placar menciona Trophy", () => {
    for (const file of BOARD_FILES) {
      expect(read(file), `${file} voltou a usar Trophy no placar`).not.toContain("Trophy");
    }
  });

  it("os quatro usam o raio", () => {
    for (const file of BOARD_FILES) {
      expect(read(file), `${file} perdeu o Zap`).toContain("Zap");
    }
  });

  it("as superfícies de troféu usam Trophy/Crown", () => {
    const shelf = read(SHELF);
    expect(shelf).toContain("Trophy");
    expect(shelf).toContain("Crown");
    expect(read(SEASON_CARD)).toContain("Trophy");
  });
});

describe("o placar do mês fala do mês", () => {
  it("nenhuma tela chama o placar de acumulados", () => {
    for (const file of [PROFILE_PAGE, PROFILE_VIEW, RANKING_PAGE, SEASON_CARD, CYCLE_HISTORY]) {
      expect(readProse(file), `${file} voltou a dizer "acumulados" na tela`).not.toMatch(/acumulados/i);
    }
  });

  it("o quadro mostra o mês e o livro-caixa mostra o ano fechado", () => {
    const ranking = read(RANKING_PAGE);
    expect(ranking).toContain("civilMonthLabel");
    expect(ranking).toContain("GamificationAPI.getSeasonBook");
    expect(read(CYCLE_HISTORY)).toContain("civilMonthLabel");
  });

  it("a tela não ordena a lista de usuários por pontos: quem ordena é o use case", () => {
    // A versão antiga da tela fazia `[...users].sort((l, r) => r.points - l.points)` — a segunda régua.
    const ranking = read(RANKING_PAGE);
    expect(ranking).not.toContain(".sort(");
    expect(ranking).toContain("GamificationAPI.getRanking");
    expect(ranking).toContain("position");
    const profile = read(PROFILE_PAGE);
    expect(profile).not.toContain("rankedUsers");
  });
});
