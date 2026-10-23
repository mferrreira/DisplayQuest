/**
 * backend/domain/gamification/elo-rules.ts — a escada de elo da temporada (plan-v8 V8-6, DEC-217).
 *
 * O elo é o rótulo de prestígio da temporada (MODELO §7): seis degraus, derivados do **XP da
 * temporada** — não dos pontos (a rodada 4 do dono corrigiu isso: "elo mede a temporada") e não do
 * saldo vitalício que a escada antiga de `Progression.ts` media (0/700/1500/2500 sobre `points`,
 * trilha que a virada zera). Zera com a temporada: na virada o elo volta ao primeiro degrau
 * (MODELO §4), porque elo é trilha da temporada como o XP.
 *
 * A escada também decide os **slots de troféu** (rodada 4): 0/1/2/2/3/3. O elo DO MOMENTO manda —
 * quem subiu a OURO em março equipou dois a partir de março, e a virada devolve os slots ao degrau
 * novo. Daí `trophySlotsForElo` nascer ao lado do umbral: as duas coisas são a mesma linha da
 * tabela, e dois lugares decidindo slots é o jeito de eles divergirem.
 *
 * Os umbrais 0/400/900/1500/2400/3600 são estimativa da primeira temporada (MODELO §9,
 * ASK-V8-22): calibráveis com dados reais, e por isso vivem nesta tabela e em nenhum outro lugar.
 *
 * Pureza (RG-01): nenhuma porta, nenhum repo. O `now` não entra aqui — elo é função do XP, e quem
 * sabe o XP é o chamador.
 */

export const ELO_TIERS = ["BRONZE", "PRATA", "OURO", "PLATINA", "DIAMANTE", "DESAFIANTE"] as const;

export type EloTier = (typeof ELO_TIERS)[number];

export interface EloLadderStep {
  elo: EloTier;
  /** O XP da temporada que abre o degrau (inclusivo). */
  minSeasonXp: number;
  /** Quantos troféus equipados este degrau permite. */
  trophySlots: number;
}

/**
 * A escada, do primeiro degrau ao último. O `trophySlots` é a DEC-217 na mesma linha do umbral:
 * BRONZE 0, PRATA 1, OURO 2, PLATINA 2, DIAMANTE 3, DESAFIANTE 3 (MODELO §6, rodada 4).
 */
export const ELO_LADDER: readonly EloLadderStep[] = [
  { elo: "BRONZE", minSeasonXp: 0, trophySlots: 0 },
  { elo: "PRATA", minSeasonXp: 400, trophySlots: 1 },
  { elo: "OURO", minSeasonXp: 900, trophySlots: 2 },
  { elo: "PLATINA", minSeasonXp: 1500, trophySlots: 2 },
  { elo: "DIAMANTE", minSeasonXp: 2400, trophySlots: 3 },
  { elo: "DESAFIANTE", minSeasonXp: 3600, trophySlots: 3 },
];

/** O degrau de quem começa a temporada (e o de quem volta na virada). */
export const FIRST_SEASON_ELO: EloTier = "BRONZE";

/** Rótulo de exibição do degrau. O token do banco é maiúsculo; a UI escreve em caso de título. */
export const ELO_LABELS: Record<EloTier, string> = {
  BRONZE: "Bronze",
  PRATA: "Prata",
  OURO: "Ouro",
  PLATINA: "Platina",
  DIAMANTE: "Diamante",
  DESAFIANTE: "Desafiante",
};

export function isEloTier(value: unknown): value is EloTier {
  return typeof value === "string" && (ELO_TIERS as readonly string[]).includes(value);
}

/**
 * O degrau do XP da temporada. XP negativo entra como 0: a trilha tem piso 0 no domínio
 * (`applyXpFloor`, DEC-214), e uma regra que recebesse um valor fora dessa promessa não pode
 * inventar um degrau abaixo do primeiro.
 */
export function eloForSeasonXp(seasonXp: number): EloTier {
  const xp = Number.isFinite(seasonXp) ? Math.max(0, seasonXp) : 0;
  const step = [...ELO_LADDER].reverse().find((entry) => xp >= entry.minSeasonXp);
  return step?.elo ?? FIRST_SEASON_ELO;
}

/** O degrau inteiro da escada (umbral + slots), para quem precisa das duas coisas de uma vez. */
export function eloLadderStep(elo: EloTier): EloLadderStep {
  const step = ELO_LADDER.find((entry) => entry.elo === elo);
  if (!step) {
    throw new Error(`elo fora da escada: ${elo}`);
  }
  return step;
}

/** O XP que abre o degrau. É o que a UI mostra como "próximo elo" (V8-7). */
export function seasonXpForElo(elo: EloTier): number {
  return eloLadderStep(elo).minSeasonXp;
}

/** Os slots de troféu do degrau (DEC-217). BRONZE é 0 de propósito: sem elo, sem troféu equipado. */
export function trophySlotsForElo(elo: EloTier): number {
  return eloLadderStep(elo).trophySlots;
}

/** O degrau seguinte, ou `null` no topo. `xpMissing` é o que falta para ele. */
export function nextEloLadderStep(
  seasonXp: number,
): (EloLadderStep & { xpMissing: number }) | null {
  const xp = Number.isFinite(seasonXp) ? Math.max(0, seasonXp) : 0;
  const next = ELO_LADDER.find((entry) => entry.minSeasonXp > xp);
  return next ? { ...next, xpMissing: next.minSeasonXp - xp } : null;
}

/**
 * A frase congelada do slot (DEC-218: "equip acima do slot é recusado"). Uma família só de frase,
 * porque o caso "elo sem slot" e o caso "slot cheio" são a mesma regra contada em momentos
 * diferentes — dois textos diferentes seriam duas regras.
 */
export function trophySlotMessage(elo: EloTier): string {
  const slots = trophySlotsForElo(elo);
  // "até 1 troféus" é a frase errada na tela da pessoa. O singular é o mesmo número, só lido bem.
  return `Seu elo ${ELO_LABELS[elo]} permite equipar até ${slots} ${slots === 1 ? "troféu" : "troféus"}.`;
}

/**
 * O elo que o livro-caixa da temporada registra (V8-4 escrevia `null` porque a escada não existia):
 * é o degrau do XP com que a pessoa fechou o ano. O elo da COLUNA volta ao primeiro degrau na
 * virada; o do livro é a memória da temporada.
 */
export function seasonClosingEloForXp(seasonXp: number): EloTier {
  return eloForSeasonXp(seasonXp);
}

/**
 * A linha de slots do perfil e da prateleira de troféus (V8-7, DEC-220): quantos equipados sobre
 * quantos o degrau abre. Mora ao lado de `trophySlotMessage` porque é a MESMA conta do slot dita de
 * dois modos — a recusa (409) e o estado. Um texto de "2 de 3 slots" escrito na tela seria a régua
 * de slot em dois lugares (a lição da DEC-90/96).
 */
export function trophySlotProgressLabel(equipped: number, slots: number): string {
  return `${equipped} de ${slots} ${slots === 1 ? "slot" : "slots"} ${slots === 1 ? "usado" : "usados"}`;
}
