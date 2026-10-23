import type { SeasonKey } from "@/backend/domain/gamification";

/**
 * SeasonChampionPort — plan-v8 V8-4 (DEC-213). A concessão do troféu do primeiro colocado da
 * temporada, separada do ciclo por uma razão de desenho: o `AwardBadgeUseCase` do catálogo tem gate
 * `MANAGE_USERS` e é a autoridade de um humano concedendo um troféu. A virada de temporada é rotina
 * de sistema (`systemActor`), e acoplar as duas — ou abrir uma exceção no gate do outro — era o jeito
 * de as duas regras divergirem sem o `tsc` ver.
 *
 * O troféu é vitalício: a unique `(userId, badgeId)` de `user_badges` já bloqueia uma segunda
 * conquista, e a chave `GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>` na linha de auditoria registra
 * o ANO em que a concessão aconteceu. Quem foi campeão em dois anos continua com um troféu e passa a
 * ter duas linhas de decisão.
 */

export type SeasonChampionAwardStatus = "awarded" | "already-awarded" | "badge-ausente";

export interface SeasonChampionAward {
  year: SeasonKey;
  userId: number;
  /** Nome resolvido no catálogo. O badge vem da data migration `v8-4-badge-campeao.sql`. */
  badgeName: string;
  /** A chave de reexecução da onda: `seasonChampionDescription(year, userId)` do domínio. */
  description: string;
}

export interface SeasonChampionAwardResult {
  status: SeasonChampionAwardStatus;
  badgeId: number | null;
}

export interface SeasonChampionPort {
  /**
   * Concessão idempotente, dentro de uma transação: lê a linha de auditoria da chave, procura o
   * badge pelo nome, cria `user_badges` quando a pessoa ainda não o tem e escreve a linha de
   * auditoria. `badge-ausente` quando o catálogo não tem o troféu — o fechamento das linhas de
   * temporada não aborta por isso, e a rotina loga o aviso.
   */
  awardSeasonChampion(award: SeasonChampionAward): Promise<SeasonChampionAwardResult>;
}
