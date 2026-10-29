/**
 * V5-10a (DEC-75/130/140/170/171) — regras puras do atestado de frequência, congeladas
 * ANTES do código.
 *
 * A semântica saiu da FOLHA MEDIDA (V5-1a/DEC-130): os rótulos estáticos do oficial foram
 * decodificados do stream de conteúdo (texto CID + ToUnicode) e amarrados aos retângulos dos
 * 42 campos. O que fica preso aqui:
 *   1. `data` é o mês de referência por extenso — o corpo do oficial diz "obteve frequência
 *      integral durante o mês de ____". Mês incompleto não pode ser atestado como integral:
 *      o default do mês de referência é o ANTERIOR ao da geração.
 *   2. `dia`/`mes`/`ano` são a data da assinatura ("Januária, __ de ______ de ____."), i.e. a
 *      data de geração — data civil (DEC-132), nunca `new Date()` solto.
 *   3. Carga vem de `project_members.cargaHoraria` (DEC-140): 8 → `carga_8`, 20 → `carga_20`,
 *      outro valor → `carga_adaptada` + `horas_adaptada`. Sem carga, nenhum dos três.
 *   4. Campos sem fonte no sistema ficam VAZIOS (`se_bolsista`, `coorientador`, `is_ifnmg`,
 *      `justificativa`) — a honestidade do DEC-168 vale para o PDF: o sistema não inventa.
 *   5. `status_*` vem do cronograma (plan V5-10): situação do projeto no mês de referência.
 */
import { describe, expect, it } from "vitest";

import {
  buildAttestationFields,
  certificateBlobKey,
  certificateFileName,
  certificateReminderMessage,
  certificateReminderRecipients,
  monthNameLong,
  normalizeAttestationMonth,
  previousMonth,
  projectScheduleStatus,
  summarizeAttestationSessionLogs,
  missingAttestationFieldLabels,
} from "@/backend/domain";

const project = { name: "IA no campo", editalNumber: "EDITAL 09/2026", proppiNumber: "PROPPI-2026-017" };
const member = {
  name: "Bento Lima",
  cpf: "12345678901",
  registrationNumber: "2026123456",
  level: "GRADUACAO",
  scholarshipType: "PIBIC",
  fundingAgency: "CNPQ",
  fundingAgencyOther: null,
};
const membership = { categoria: "BOLSISTA", cargaHoraria: 8 };
const activities = [
  { description: "Levantamento bibliográfico", firstMonth: "2026-08", lastMonth: "2026-10", status: "DONE" },
  { description: "Coleta de dados", firstMonth: "2026-10", lastMonth: "2026-11", status: "OPEN" },
];

function fields(overrides: Record<string, unknown> = {}) {
  return buildAttestationFields({
    project,
    member,
    membership,
    activities,
    month: "2026-10",
    now: { dia: "19", mes: "outubro", ano: "2026" },
    ...overrides,
  });
}

describe("mês de referência do atestado (V5-10a, DEC-171)", () => {
  it("aceita AAAA-MM e recusa o resto nomeando o campo", () => {
    expect(normalizeAttestationMonth("2026-10")).toBe("2026-10");
    expect(() => normalizeAttestationMonth("10/2026")).toThrow(/mês de referência/i);
    expect(() => normalizeAttestationMonth("2026-13")).toThrow(/mês de referência/i);
    expect(() => normalizeAttestationMonth("2026-1")).toThrow(/mês de referência/i);
  });

  it("o nome do mês sai por extenso em minúsculas — o corpo do oficial pede o mês, não o número", () => {
    expect(monthNameLong("2026-10")).toBe("outubro");
    expect(monthNameLong("2026-01")).toBe("janeiro");
    expect(monthNameLong("2026-12")).toBe("dezembro");
  });

  it("o default do mês de referência é o ANTERIOR à geração — mês em curso não é atestado como integral (DEC-171)", () => {
    expect(previousMonth("2026-10-19")).toBe("2026-09");
    expect(previousMonth("2027-01-05")).toBe("2026-12");
  });
});

describe("preenchimento do AcroForm (V5-10a, DEC-130/140/171)", () => {
  it("os campos de pessoa e projeto saem do que o sistema tem", () => {
    const f = fields();
    expect(f.nome).toBe("Bento Lima");
    expect(f.CPF).toBe("123.456.789-01"); // a folha oficial grafará com os pontos
    expect(f.matricula).toBe("2026123456");
    expect(f.titulo).toBe("IA no campo");
    expect(f.edital).toBe("EDITAL 09/2026");
    expect(f.data).toBe("outubro"); // corpo: "durante o mês de ____"
    expect(f.dia).toBe("19");
    expect(f.mes).toBe("outubro");
    expect(f.ano).toBe("2026");
  });

  it("edital cai no nº PROPPI quando o projeto não tem edital (DEC-140)", () => {
    const f = fields({ project: { ...project, editalNumber: null } });
    expect(f.edital).toBe("PROPPI-2026-017");
  });

  it("checkboxes de nível, caracterização, modalidade e fomento seguem as listas fechadas", () => {
    const f = fields();
    expect(f.nivel_graduacao).toBe(true);
    expect(f.nivel_medio).toBeUndefined();
    expect(f.is_bolsista).toBe(true);
    expect(f.is_voluntario).toBeUndefined();
    expect(f.is_pibic).toBe(true);
    expect(f.is_cnpq).toBe(true);
    expect(f.is_fapemig).toBeUndefined();
    expect(f.is_outra).toBeUndefined();
  });

  it("fomento OUTRA escreve a instituição em `agencia_outra`", () => {
    const f = fields({
      member: { ...member, fundingAgency: "OUTRA", fundingAgencyOther: "FAPEMIG — chamada interna" },
    });
    expect(f.is_outra).toBe(true);
    expect(f.agencia_outra).toBe("FAPEMIG — chamada interna");
  });

  it("modalidade VOLUNTARIO marca a caracterização, não uma checkbox de modalidade (medido: a folha não tem 'Voluntário' na linha de modalidade)", () => {
    const f = fields({ member: { ...member, scholarshipType: "VOLUNTARIO" }, membership: { categoria: null, cargaHoraria: null } });
    expect(f.is_voluntario).toBe(true);
    expect(f.is_pibic).toBeUndefined();
  });

  it("carga 8 e 20 marcam a checkbox própria; qualquer outro valor marca a adaptada com as horas (DEC-140)", () => {
    expect(fields().carga_8).toBe(true);
    const vinte = fields({ membership: { categoria: "BOLSISTA", cargaHoraria: 20 } });
    expect(vinte.carga_20).toBe(true);
    expect(vinte.carga_8).toBeUndefined();
    const adaptada = fields({ membership: { categoria: "BOLSISTA", cargaHoraria: 12 } });
    expect(adaptada.carga_adaptada).toBe(true);
    expect(adaptada.horas_adaptada).toBe("12");
    const semCarga = fields({ membership: { categoria: null, cargaHoraria: null } });
    expect(semCarga.carga_8).toBeUndefined();
    expect(semCarga.carga_20).toBeUndefined();
    expect(semCarga.carga_adaptada).toBeUndefined();
  });

  it("campos sem fonte no sistema ficam vazios — o sistema não inventa (DEC-168 vale para o PDF)", () => {
    const f = fields();
    expect(f.se_bolsista).toBeUndefined();
    expect(f.coorientador).toBeUndefined();
    expect(f.is_ifnmg).toBeUndefined();
    expect(f.justificativa).toBeUndefined();
  });

  it("pessoa sem CPF/matrícula/nível não fabrica nada", () => {
    const f = fields({
      member: { ...member, cpf: null, registrationNumber: null, level: null, scholarshipType: null, fundingAgency: null },
    });
    expect(f.CPF).toBeUndefined();
    expect(f.matricula).toBeUndefined();
    expect(f.nivel_graduacao).toBeUndefined();
    expect(f.is_pibic).toBeUndefined();
  });

  it("as duas atividades do corpo vêm do cronograma que cruza o mês de referência, na ordem", () => {
    const f = fields();
    expect(f.atividades_1).toBe("Levantamento bibliográfico");
    expect(f.atividade_2).toBe("Coleta de dados");
  });

  it("mais que duas atividades: as duas primeiras do cruza entram, a terceira não", () => {
    const f = fields({
      activities: [
        ...activities,
        { description: "Análise dos resultados", firstMonth: "2026-10", lastMonth: "2026-10", status: "OPEN" },
      ],
    });
    expect(f.atividades_1).toBe("Levantamento bibliográfico");
    expect(f.atividade_2).toBe("Coleta de dados");
    expect(Object.values(f)).not.toContain("Análise dos resultados");
  });

  it("nenhuma atividade no mês: as duas caixas ficam vazias", () => {
    const f = fields({ activities: [] });
    expect(f.atividades_1).toBeUndefined();
    expect(f.atividade_2).toBeUndefined();
  });

  it("mantém cronograma na primeira linha e acrescenta síntese dos logs na segunda", () => {
    const f = fields({ sessionSummary: "Revisão bibliográfica: leitura e fichamento" });
    expect(f.atividades_1).toBe("Levantamento bibliográfico");
    expect(f.atividade_2).toBe("Coleta de dados; Revisão bibliográfica: leitura e fichamento");
  });
});

describe("síntese mensal dos logs do atestado", () => {
  it("deduplica registros iguais e não cria resultado sem anotação", () => {
    expect(summarizeAttestationSessionLogs([
      { activity: "Revisão bibliográfica", note: "leitura de artigos", endTime: "2026-09-02" },
      { activity: "Revisão bibliográfica", note: "leitura de artigos", endTime: "2026-09-03" },
      { activity: "Coleta de dados", note: "Sessão de trabalho finalizada. Atividade: Coleta de dados", endTime: "2026-09-04" },
    ])).toBe("Revisão bibliográfica: leitura de artigos; Coleta de dados");
  });

  it("avisa dados preenchíveis faltantes sem tornar a geração inválida", () => {
    const input = {
      project: { ...project, editalNumber: null, proppiNumber: null },
      member: { ...member, cpf: null, registrationNumber: null, level: null, scholarshipType: null, fundingAgency: null },
      membership: { categoria: null, cargaHoraria: null },
      activities: [],
      month: "2026-10",
      now: { dia: "19", mes: "outubro", ano: "2026" },
    };
    expect(missingAttestationFieldLabels(input)).toContain("CPF");
    expect(missingAttestationFieldLabels(input)).toContain("Atividades do cronograma no mês");
    expect(() => buildAttestationFields(input)).not.toThrow();
  });
});

describe("situação atual do projeto no mês de referência (V5-10a, plan V5-10)", () => {
  it("sem cronograma é 'nao-iniciado'", () => {
    expect(projectScheduleStatus([], "2026-10")).toBe("nao-iniciado");
    expect(fields({ activities: [] })["status_nao-iniciado"]).toBe(true);
  });

  it("atividade do mês ainda aberta é 'atrasado'", () => {
    // 2026-10 já começou (firstMonth 2026-10) e não está DONE.
    expect(projectScheduleStatus(activities, "2026-10")).toBe("atrasado");
  });

  it("tudo planejado até o mês está DONE, mas o projeto segue: 'como-previsto'", () => {
    const emDia = [
      { description: "Levantamento", firstMonth: "2026-08", lastMonth: "2026-09", status: "DONE" },
      { description: "Coleta", firstMonth: "2026-10", lastMonth: "2026-10", status: "DONE" },
      { description: "Análise", firstMonth: "2026-11", lastMonth: "2026-11", status: "OPEN" },
    ];
    expect(projectScheduleStatus(emDia, "2026-10")).toBe("como-previsto");
  });

  it("concluiu atividade planejada para mês futuro é 'adiantado'", () => {
    const adiantado = [
      { description: "Levantamento", firstMonth: "2026-08", lastMonth: "2026-09", status: "DONE" },
      { description: "Coleta", firstMonth: "2026-11", lastMonth: "2026-11", status: "DONE" }, // planejada p/ nov, já feita em outubro
      { description: "Análise", firstMonth: "2026-12", lastMonth: "2026-12", status: "OPEN" }, // o projeto não terminou
    ];
    expect(projectScheduleStatus(adiantado, "2026-10")).toBe("adiantado");
  });

  it("todas as atividades DONE é 'concluido' — mesmo antes do fim do cronograma", () => {
    const concluido = [
      { description: "Levantamento", firstMonth: "2026-08", lastMonth: "2026-09", status: "DONE" },
      { description: "Coleta", firstMonth: "2026-10", lastMonth: "2026-10", status: "DONE" },
    ];
    expect(projectScheduleStatus(concluido, "2026-10")).toBe("concluido");
  });
});

describe("chave e nome do arquivo (V5-10a, DEC-170)", () => {
  it("a chave é derivada do trio projeto-membro-mês — regenerar sobrescreve", () => {
    expect(certificateBlobKey(7, 9, "2026-10")).toBe("projects/7/certificates/9/2026-10.pdf");
  });

  it("o nome de exibição é slug ASCII com mês e projeto", () => {
    expect(certificateFileName("IA no campo", "2026-10")).toBe("atestado-2026-10-ia-no-campo.pdf");
  });
});

describe("lembrete de frequência (V5-10b, DEC-72)", () => {
  it("a mensagem nomeia o mês de referência por extenso e o projeto", () => {
    expect(certificateReminderMessage("IA no campo", "2026-09")).toBe(
      'O atestado de frequência de setembro já pode ser gerado para o projeto "IA no campo".',
    );
  });

  it("audiência: líder primeiro, gestores globais depois, dedupe, líder nulo sai", () => {
    expect(certificateReminderRecipients(7, [1, 2])).toEqual([7, 1, 2]);
    expect(certificateReminderRecipients(7, [7, 1])).toEqual([7, 1]);
    expect(certificateReminderRecipients(null, [1, 2])).toEqual([1, 2]);
    expect(certificateReminderRecipients(null, [])).toEqual([]);
  });
});
