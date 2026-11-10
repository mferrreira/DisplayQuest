import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S03 (plan-v21, DEC-258) — `DELETE` remove um arquivo de entregável.
 *
 * A ordem do demo é a asserção: o registro sai do módulo ANTES de o objeto sair do bucket
 * (mesma lição da troca de imagem do V5-2d — o estado que o banco diz é a verdade, e objeto
 * órfão é lixo de bucket, não dado de projeto). O gate de gestão é do use case, e a ordem de
 * recusa é a do add: projeto 404 → gate 403 → entregável 404 → arquivo 404. Falha no bucket
 * não derruba a resposta: `catch` engole, o registro já era fora.
 */
export async function DELETE(
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

    // Gate da rota ANTES do use case (mesma régua do upload, DEC-54): o use case rechecha, e a
    // ordem gate → registro → bucket fica medida na rota, não só dentro do módulo.
    await projectManagementModule.assertCanManageProject({ projectId, actorId: auth.actor.id })

    const removed = await projectManagementModule.deleteProjectDeliverableFile({
      projectId,
      deliverableId,
      fileId,
      actorId: auth.actor.id,
    })

    // O registro já saiu. A chave removida vem do record, e o objeto vai atrás.
    const store = blobStoreFromEnv()
    if (store && removed.blobKey) {
      await store.remove(removed.blobKey).catch(() => undefined)
    }

    return NextResponse.json({ file: removed }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}