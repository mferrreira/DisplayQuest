import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { PROJECT_IMAGE_SLOT_MESSAGE, isProjectImageSlot, projectImagePrefix } from "@/backend/domain"
import { blobStoreFromEnv, isImageBlobContentType, newBlobKey, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"
import { ImageProcessor } from "@/lib/utils/image-processor"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-2d (DEC-102) — imagem do projeto: `PUT` sobe/troca, `DELETE` tira.
 *
 * Ordem medida, a mesma do anexo (DEC-133): autorizar antes de ler o corpo, validar pelo seam,
 * escrever o objeto, escrever o registro. Duas coisas a mais, próprias de slot:
 *   - só IMAGEM passa. Anexo aceita pdf/vídeo; logo e banner não. A checagem é do seam
 *     (`isImageBlobContentType`), porque a allowlist mora lá.
 *   - trocar imagem deixa objeto para trás. O use case devolve a chave anterior e a rota a remove.
 *     Se a gravação do registro falhar, o objeto NOVO é removido — o projeto continua com a imagem
 *     antiga, que é o estado que o banco diz.
 */

function parseSlot(context: { params: Promise<{ id: string; slot: string }> }) {
  return context.params.then((params) => {
    const projectId = Number(params.id)
    return {
      projectId,
      validProject: Number.isInteger(projectId) && projectId > 0,
      // `null` é o slot que não é um dos dois conhecidos: a rota responde 400 com a mensagem do
      // domínio, e o tipo estreito impede de levar um `string` cru para o use case.
      slot: isProjectImageSlot(params.slot) ? params.slot : null,
    }
  })
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; slot: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { projectId, slot, validProject } = await parseSlot(context)
    if (!validProject) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }
    if (!slot) {
      return NextResponse.json({ error: PROJECT_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    // Gate antes do corpo: upload é o corpo caro (DEC-54 com o custo invertido).
    await projectManagementModule.assertCanManageProject({ projectId, actorId: auth.actor.id })

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })
    }

    if (!isImageBlobContentType(file.type)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido para imagem de projeto: ${file.type || "desconhecido"}` },
        { status: 400 },
      )
    }

    const validation = validateBlobUpload({
      contentType: file.type,
      size: file.size,
      head: await readFileHead(file),
    })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    // R12 (S12): a capa entra no bucket como WebP. O byte de origem é validado como imagem; o
    // objeto gravado é o WebP convertido, com ContentType `image/webp` e chave `.webp`.
    const webp = await ImageProcessor.toWebP(Buffer.from(await file.arrayBuffer()))
    const key = newBlobKey(projectImagePrefix(projectId, slot), "image/webp")
    await store.put(key, webp, "image/webp")

    try {
      const result = await projectManagementModule.updateProjectImage({
        projectId,
        actorId: auth.actor.id,
        slot,
        blobKey: key,
      })
      // A imagem antiga só sai do bucket depois que o registro aponta para a nova.
      if (result.previousKey) {
        await store.remove(result.previousKey).catch(() => undefined)
      }
      return NextResponse.json({ project: result.project }, { status: 200 })
    } catch (error) {
      await store.remove(key).catch(() => undefined)
      throw error
    }
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; slot: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { projectId, slot, validProject } = await parseSlot(context)
    if (!validProject) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }
    if (!slot) {
      return NextResponse.json({ error: PROJECT_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    const result = await projectManagementModule.updateProjectImage({
      projectId,
      actorId: auth.actor.id,
      slot,
      blobKey: null,
    })

    const store = blobStoreFromEnv()
    if (store && result.previousKey) {
      await store.remove(result.previousKey).catch(() => undefined)
    }

    return NextResponse.json({ project: result.project }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
