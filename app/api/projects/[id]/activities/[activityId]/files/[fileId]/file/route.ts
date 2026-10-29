import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-7a (DEC-133) — serve o binário da prova. Mesma postura do anexo: o blob nunca é estático,
 * e a regra de acesso é a do projeto (o `getActivityFile` decide), não a posse do arquivo.
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; activityId: string; fileId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    const activityId = Number(params.activityId)
    const fileId = Number(params.fileId)
    if (![projectId, activityId, fileId].every((n) => Number.isInteger(n) && n > 0)) {
      return NextResponse.json({ error: "Projeto, atividade ou prova inválida" }, { status: 400 })
    }

    const proof = await projectManagementModule.getActivityFile({
      projectId,
      activityId,
      fileId,
      actorId: auth.actor.id,
    })

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const object = await store.get(proof.blobKey)
    if (!object) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    }

    // `filename*` porque o nome pode ter acento — mesmo motivo medido no anexo.
    return new NextResponse(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": proof.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(proof.name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao servir arquivo" })
  }
}
