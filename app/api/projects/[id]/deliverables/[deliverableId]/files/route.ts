import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { projectDeliverableFilePrefix } from "@/backend/domain"
import { blobStoreFromEnv, newBlobKey, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"
import { sanitizeDisplayName } from "@/lib/storage/display-name"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S02 (plan-v21) — arquivos de entregável: `GET` lista o metadado, `POST` sobe um arquivo.
 *
 * Ordem medida, não decorativa (mesma da rota de anexo, DEC-54/133):
 *   1. autorizar a gestão ANTES de ler o corpo (`assertCanManageProject`). Sem isso, quem não
 *      gerencia empurraria bytes no bucket e só depois receberia o 403.
 *   2. validar tipo/tamanho/assinatura pelo seam — a mesma allowlist do anexo.
 *   3. escrever o objeto no bucket sob o prefixo do entregável.
 *   4. escrever o registro no módulo. Se o registro falhar, o objeto é removido.
 *
 * A leitura é aberta ao autenticado (DEC-136): o voluntário vê e abre o arquivo do entregável.
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; deliverableId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    const deliverableId = Number(params.deliverableId)
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(deliverableId) || deliverableId <= 0) {
      return NextResponse.json({ error: "Projeto ou entregável inválido" }, { status: 400 })
    }

    const files = await projectManagementModule.listProjectDeliverableFiles({
      projectId,
      deliverableId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })
    return NextResponse.json({ files }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string; deliverableId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    const deliverableId = Number(params.deliverableId)
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(deliverableId) || deliverableId <= 0) {
      return NextResponse.json({ error: "Projeto ou entregável inválido" }, { status: 400 })
    }

    // 1. gate antes do corpo.
    await projectManagementModule.assertCanManageProject({ projectId, actorId: auth.actor.id })

    // 2. o arquivo.
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })
    }

    const validation = validateBlobUpload({
      contentType: file.type,
      size: file.size,
      head: await readFileHead(file),
    })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // 3. bucket.
    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const key = newBlobKey(projectDeliverableFilePrefix(projectId, deliverableId), file.type)
    await store.put(key, new Uint8Array(await file.arrayBuffer()), file.type)

    // 4. registro, com compensação do objeto se ele falhar.
    try {
      const created = await projectManagementModule.addProjectDeliverableFile({
        projectId,
        deliverableId,
        actorId: auth.actor.id,
        blobKey: key,
        name: sanitizeDisplayName(file.name),
        contentType: file.type,
        size: file.size,
      })
      return NextResponse.json({ file: created }, { status: 201 })
    } catch (error) {
      await store.remove(key).catch(() => undefined)
      throw error
    }
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
