// @vitest-environment node
/**
 * S06 (plan-v12, DEC-239) — G4 roundtrip do recorte da capa do projeto contra o banco de teste
 * isolado (5433, nunca 5432). Mesma postura do roundtrip do perfil: as colunas de verdade, o
 * gate de gestão do vínculo, e o parâmetro que entra.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProjectStatus, userActor } from "@/backend/domain";
import { prisma } from "@/lib/database/prisma";
import { createProjectManagementModule } from "@/backend/modules/project-management";

const projectModule = createProjectManagementModule();
const manager = userActor(1, ["COORDENADOR"]);
const createdProjectIds: number[] = [];
let projectId = 0;

describe("G4 roundtrip — recorte da capa do projeto (isolated test DB)", () => {
  beforeAll(async () => {
    const created = await projectModule.createProject({
      data: { name: `G4 Crop ${Date.now()}`, status: ProjectStatus.ACTIVE },
      actorId: 1,
      actor: manager,
    });
    projectId = created.id as number;
    createdProjectIds.push(projectId);
  });

  afterAll(async () => {
    if (createdProjectIds.length > 0) {
      await prisma.projects.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
  });

  it("o use case grava as três colunas e a leitura do projeto devolve os parâmetros", async () => {
    const updated = await projectModule.updateProjectBannerCrop({
      projectId,
      actorId: 1,
      params: { x: 0.3, y: 0.6, zoom: 2 },
    });
    expect(updated.bannerCropX).toBe(0.3);
    expect(updated.bannerCropY).toBe(0.6);
    expect(updated.bannerCropZoom).toBe(2);

    const row = await prisma.projects.findUnique({ where: { id: projectId } });
    expect(row?.bannerCropX).toBe(0.3);
    expect(row?.bannerCropY).toBe(0.6);
    expect(row?.bannerCropZoom).toBe(2);

    const listed = (await projectModule.listProjectsForActor({
      actorId: 1,
      actorRoles: ["COORDENADOR"],
    })) as Array<Record<string, unknown>>;
    const seen = listed.find((p) => p.id === projectId);
    expect(seen?.bannerCropX).toBe(0.3);
    expect(seen?.bannerCropZoom).toBe(2);
  });

  it("quem não gerencia o vínculo não escreve: o gate do projeto recusa antes da coluna", async () => {
    // Sem membership e sem papel global de gestão, o voluntário da seed recebe a recusa.
    await expect(
      projectModule.updateProjectBannerCrop({
        projectId,
        actorId: 605,
        params: { x: 0.5, y: 0.5, zoom: 1 },
      }),
    ).rejects.toThrow(/permissão/i);

    const row = await prisma.projects.findUnique({ where: { id: projectId } });
    // Os valores da rodada anterior permanecem.
    expect(row?.bannerCropZoom).toBe(2);
  });

  it("subir nova capa zera os parâmetros — o recorte é do original, não do recorte", async () => {
    const upload = (await projectModule.updateProjectImage({
      projectId,
      actorId: 1,
      slot: "banner",
      blobKey: `projects/${projectId}/images/banner/novo.webp`,
    })) as unknown as { project: Record<string, unknown> };
    expect(upload.project.bannerKey).toBe(`projects/${projectId}/images/banner/novo.webp`);

    const row = await prisma.projects.findUnique({ where: { id: projectId } });
    expect(row?.bannerCropX).toBeNull();
    expect(row?.bannerCropY).toBeNull();
    expect(row?.bannerCropZoom).toBeNull();
  });
});
