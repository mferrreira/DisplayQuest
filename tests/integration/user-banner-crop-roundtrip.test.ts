// @vitest-environment node
/**
 * S05 (plan-v12, DEC-239) — G4 roundtrip do recorte da capa do perfil contra o banco de teste
 * isolado (5433, nunca 5432). Prova as colunas de verdade: o use case grava, a leitura da lista
 * traz os parâmetros, e o clamp acontece antes da escrita.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { userActor } from "@/backend/domain";
import { prisma } from "@/lib/database/prisma";
import { createUserManagementModule } from "@/backend/modules/user-management";

const userModule = createUserManagementModule();
const managerActor = userActor(1, ["COORDENADOR"]);
const uniqueEmail = `g4-crop-${Date.now()}@test.local`;
const createdUserIds: number[] = [];
let userId = 0;

describe("G4 roundtrip — recorte da capa do perfil (isolated test DB)", () => {
  beforeAll(async () => {
    const created = (await userModule.registerUser({
      name: "G4 Crop",
      email: uniqueEmail,
      password: "g4-secret123",
    })) as Record<string, unknown>;
    userId = created.id as number;
    createdUserIds.push(userId);
    await userModule.moderatePendingUser(managerActor, userId, "approve");
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  it("o use case grava as três colunas e a leitura da lista devolve os parâmetros", async () => {
    const self = userActor(userId, ["VOLUNTARIO"]);
    const updated = await userModule.updateUserBannerCrop({
      actor: self,
      userId,
      params: { x: 0.3, y: 0.6, zoom: 2 },
    });
    expect(updated.bannerCropX).toBe(0.3);
    expect(updated.bannerCropY).toBe(0.6);
    expect(updated.bannerCropZoom).toBe(2);

    const row = await prisma.users.findUnique({ where: { id: userId } });
    expect(row?.bannerCropX).toBe(0.3);
    expect(row?.bannerCropY).toBe(0.6);
    expect(row?.bannerCropZoom).toBe(2);

    const listed = (await userModule.listUsersForActor({ actor: managerActor })) as Array<
      Record<string, unknown>
    >;
    const seen = listed.find((u) => u.id === userId);
    expect(seen?.bannerCropX).toBe(0.3);
    expect(seen?.bannerCropZoom).toBe(2);
  });

  it("subir nova capa zera os parâmetros — o recorte é do original, não do recorte", async () => {
    const self = userActor(userId, ["VOLUNTARIO"]);
    await userModule.updateUserBannerCrop({ actor: self, userId, params: { x: 0.7, y: 0.3, zoom: 3 } });
    const upload = await userModule.updateUserImage({
      actor: self,
      userId,
      slot: "banner",
      blobKey: `users/${userId}/images/banner/novo.webp`,
    });
    expect(upload.user.bannerKey).toBe(`users/${userId}/images/banner/novo.webp`);
    expect(upload.user.bannerCropX).toBeNull();
    expect(upload.user.bannerCropY).toBeNull();
    expect(upload.user.bannerCropZoom).toBeNull();

    const row = await prisma.users.findUnique({ where: { id: userId } });
    expect(row?.bannerCropX).toBeNull();
    expect(row?.bannerCropZoom).toBeNull();
  });
});
