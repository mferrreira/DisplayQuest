/**
 * plan-v8 V8-5 (DEC-215 + ASK-V8-24, respondida pelo dono em 2026-10-22) — o ajuste manual do
 * painel admin sobre as DUAS trilhas de saldo, separadas.
 *
 * O dono pediu: `set`/`add`/`remove` de PONTOS do mês e `set`/`add`/`remove` de MOEDAS, cada
 * ajuste gravando linha de `history` para auditoria. Estas são as regras puras da aritmética e do
 * vocabulário; quem grava a linha é o adaptador do ledger (porta do módulo), e quem decide o
 * direito (MANAGE_USERS) é o caso de uso.
 *
 * A gramática é a mesma das duas trilhas e a aritmética também, com UMA assimetria medida:
 * `set` aceita valor negativo só na trilha pontos (DEC-60, dono em 2026-10-05), porque a premiação
 * de tarefa produz total negativo (DEC-39, penalidade sem piso) e a administração precisava
 * conseguir escrevê-lo de volta. Na moeda não existe fonte de saldo negativo — o prêmio é sempre
 * ≥ 0 (DEC-215: 100 × meses com −10%/dia e PISO 0, DEC-74) e a moeda é o saldo que a loja cobra
 * (DEC-216). Saldo de moeda negativo seria debito de loja, que nenhum caminho produz; então
 * `set` de moeda exige não-negativo (DEC-222).
 */
import { ValidationError } from "@/backend/domain/errors";
import type { AwardBalanceTrack } from "./tracks";
import { COINS_GAMIFICATION_TRACK, POINTS_GAMIFICATION_TRACK } from "./tracks";

export type TrackAdjustmentAction = "add" | "remove" | "set";

export const TRACK_ADJUSTMENT_ACTIONS: readonly TrackAdjustmentAction[] = ["add", "remove", "set"];

/**
 * O nome da trilha na frase de recusa. Uma fonte só (lição DEC-95/96): a rota e o use case
 * nomeiam o que cobram a partir daqui, em vez de manter "pontos" e "moedas" em dois lugares.
 */
export function trackLabel(track: AwardBalanceTrack): string {
  return track === COINS_GAMIFICATION_TRACK ? "moedas" : "pontos";
}

/** O mesmo nome em início de frase: "Pontos devem ser...", "Moedas não podem ser...". */
export function trackLabelSentence(track: AwardBalanceTrack): string {
  const label = trackLabel(track);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * A trilha vinda do corpo do pedido. Vocabulário fechado no domínio: os dois valores possíveis são
 * as duas constantes (POINTs | COINS) e ausente é a trilha histórica de pontos. Devolve `null` para
 * a rota recusar com a própria frase — o domínio não decide status HTTP.
 */
export function parseBalanceTrack(value: unknown): AwardBalanceTrack | null {
  if (value === undefined) return POINTS_GAMIFICATION_TRACK;
  if (value === COINS_GAMIFICATION_TRACK) return COINS_GAMIFICATION_TRACK;
  if (value === POINTS_GAMIFICATION_TRACK) return POINTS_GAMIFICATION_TRACK;
  return null;
}

/**
 * Se o ajuste pode escrever número negativo na trilha. Só a trilha pontos, só com `set` (DEC-60).
 * É a mesma checagem que a rota faz antes do use case — ela existe nos dois lados de propósito: a
 * rota valida ENTRADA com corpo próprio, o domínio decide a regra.
 */
export function allowsNegativeAdjustment(track: AwardBalanceTrack, action: TrackAdjustmentAction): boolean {
  return action === "set" && track === POINTS_GAMIFICATION_TRACK;
}

/**
 * A aritmética do ajuste, por trilha. Os quirks congelados do caminho de pontos continuam:
 * `add` tem chão 0 em `Math.max` mesmo com delta negativo, `remove` exige suficiência.
 * O saldo novo nunca é devolvido sem checagem: quem chama escreve o número que sair daqui.
 */
export function applyTrackAdjustment(
  track: AwardBalanceTrack,
  action: TrackAdjustmentAction,
  amount: number,
  balanceBefore: number,
): number {
  const label = trackLabel(track);

  if (action === "add") {
    return Math.max(0, balanceBefore + amount);
  }

  if (action === "remove") {
    if (amount < 0) throw new ValidationError(`${trackLabelSentence(track)} não podem ser negativos`);
    if (balanceBefore < amount) {
      throw new ValidationError(`Usuário não possui ${label} suficientes`);
    }
    return balanceBefore - amount;
  }

  // `set`: valor absoluto. Negativo só na trilha pontos (DEC-60); na moeda é recusa (DEC-222).
  if (amount < 0 && !allowsNegativeAdjustment(track, action)) {
    throw new ValidationError(`${trackLabelSentence(track)} devem ser um número não negativo`);
  }
  return amount;
}

/**
 * A chave da linha de auditoria. Mesma forma das chaves do award (prefixo GAMIFICATION), com o
 * AJUSTE nomeado no meio para a linha não ser confundida com um credit de evento: as rotinas de
 * idempotência leem awards por descrição e por `action` GAMIFICATION_AWARD, e ajuste é outra
 * família (`action` TRACK_ADJUSTMENT).
 */
export function trackAdjustmentDescription(
  track: AwardBalanceTrack,
  action: TrackAdjustmentAction,
  amount: number,
): string {
  return `GAMIFICATION:ADJUSTMENT:${track}:${action}:${amount}`;
}
