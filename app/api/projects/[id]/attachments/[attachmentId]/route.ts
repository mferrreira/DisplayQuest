import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-2c — um anexo: `GET` devolve o metadado, `DELETE` apaga o registro e o objeto.
 *
 * O objeto é removido pelo seam depois que o registro apagou (e não antes): se o banco recusar,
 * o anexo continua servível em vez de virar um arquivo sem dono no bucket.
 */

function parseIds(context: { params: Promise<{ id: string; attachmentId: string }> }) {
  return context.params.then((params) => {
    const projectId = Number(params.id)
    const attachmentId = Number(params.attachmentId)
    const valid =
      Number.isInteger(projectId) && projectId > 0 && Number.isInteger(attachmentId) && attachmentId > 0
    return { projectId, attachmentId, valid }
  })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { projectId, attachmentId, valid } = await parseIds(context)
    if (!valid) {
      return NextResponse.json({ error: "Projeto ou anexo inválido" }, { status: 400 })
    }

    const attachment = await projectManagementModule.getProjectAttachment({
      projectId,
      attachmentId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })
    return NextResponse.json({ attachment }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { projectId, attachmentId, valid } = await parseIds(context)
    if (!valid) {
      return NextResponse.json({ error: "Projeto ou anexo inválido" }, { status: 400 })
    }

    const removed = await projectManagementModule.removeProjectAttachment({
      projectId,
      attachmentId,
      actorId: auth.actor.id,
    })

    const store = blobStoreFromEnv()
    if (store) {
      // O registro já saiu: falha de bucket não pode transformar um 200 em 500, o objeto órfão
      // é o menor dos males e não é alcançado por nenhuma tela.
      await store.remove(removed.blobKey).catch(() => undefined)
    }

    return NextResponse.json({ attachment: { id: removed.id } }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
