import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"
import { isProjectImageSlot, PROJECT_IMAGE_SLOT_MESSAGE } from "@/backend/domain"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-2d (DEC-101/102) — serve o binário da imagem do projeto. Nunca estático: a regra de acesso é
 * a do projeto (o `getProjectImage` decide), e a sessão chega pelo cookie, o que permite usar a URL
 * direto num `<img>`.
 *
 * Cache longo e `private`: a chave carrega um UUID, então o conteúdo deste endereço nunca muda —
 * trocar a imagem muda o endereço.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; slot: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }
    if (!isProjectImageSlot(params.slot)) {
      return NextResponse.json({ error: PROJECT_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    const image = await projectManagementModule.getProjectImage({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
      slot: params.slot,
    })

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const object = await store.get(image.blobKey)
    if (!object) {
      return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao servir imagem" })
  }
}
