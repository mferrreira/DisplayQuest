export { civilDayOfDate, civilDayOfInstant, civilDaysBetween, startOfCivilDayInstant } from "./civil-day";
// V8-7 (DEC-220): o rotulo de mes compartilhado (o cronograma do projeto e as telas do ciclo da
// gamificacao) sai pelo barrel, como o resto do core (RG-07). Uma tabela jan..dez em lugar so.
export { civilMonthLabel, isCivilMonthKey, MONTH_ABBREVIATIONS } from "./civil-day";
