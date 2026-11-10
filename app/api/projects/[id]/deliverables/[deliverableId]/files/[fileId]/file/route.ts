import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S02 (plan-v21) — serve o binário do arquivo de entregável. Mesma postura da rota de anexo
 * (DEC-133): o blob nunca é estático, e a regra de acesso é a do projeto
 * (`getProjectDeliverableFile` decide que o arquivo pertence àquele entregável daquele projeto),
 * não a posse do arquivo. A leitura é aberta ao autenticado (DEC-136).
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; deliverableId: string; fileId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    const deliverableId = Number(params.deliverableId)
    const fileId = Number(params.fileId)
    if (
      !Number.isInteger(projectId) || projectId <= 0 ||
      !Number.isInteger(deliverableId) || deliverableId <= 0 ||
      !Number.isInteger(fileId) || fileId <= 0
    ) {
      return NextResponse.json({ error: "Projeto, entregável ou arquivo inválido" }, { status: 400 })
    }

    const file = await projectManagementModule.getProjectDeliverableFile({
      projectId,
      deliverableId,
      fileId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const object = await store.get(file.blobKey)
    if (!object) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    }

    // `filename*` porque o nome pode ter acento (mesma razão da rota de anexo).
    return new NextResponse(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": file.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao servir arquivo" })
  }
}
