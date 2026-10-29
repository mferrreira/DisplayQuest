import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-7a — apagar uma prova. `GET` do metadado individual não existe de propósito: a lista
 * (`files/route.ts`) já entrega tudo que a tela mostra, e o binário sai pelo `/file`.
 *
 * O objeto é removido pelo seam DEPOIS que o registro apagou — mesma ordem medida do anexo: se
 * o banco recusar, a prova continua servível em vez de virar arquivo sem dono no bucket.
 */

export async function DELETE(
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

    const removed = await projectManagementModule.removeActivityFile({
      projectId,
      activityId,
      fileId,
      actorId: auth.actor.id,
    })

    const store = blobStoreFromEnv()
    if (store) {
      await store.remove(removed.blobKey).catch(() => undefined)
    }

    return NextResponse.json({ file: { id: removed.id } }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
