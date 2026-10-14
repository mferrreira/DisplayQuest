import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { projectActivityFilePrefix } from "@/backend/domain"
import { blobStoreFromEnv, newBlobKey, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"
import { sanitizeDisplayName } from "@/lib/storage/display-name"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-7a (DEC-76/133/157/162) — provas da atividade: `GET` lista o metadado (leitura aberta,
 * DEC-127), `POST` sobe um arquivo.
 *
 * A ordem é a medida do anexo (DEC-133), com o gate trocado pelo da fase de pedir (DEC-76):
 *   1. autorizar ANTES de ler o corpo — sem isso, quem não pode solicitar empurraria bytes ao
 *      bucket e só depois receberia o 403;
 *   2. validar tipo/tamanho/assinatura pelo seam (`lib/storage/blob-store.ts`), dono da
 *      allowlist e da tabela de magic bytes;
 *   3. escrever o objeto no bucket;
 *   4. escrever o registro no módulo, com remoção do objeto se o registro falhar.
 */

function parseIds(params: { id: string; activityId: string }) {
  const projectId = Number(params.id)
  const activityId = Number(params.activityId)
  if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(activityId) || activityId <= 0) {
    return null
  }
  return { projectId, activityId }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; activityId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const ids = parseIds(await context.params)
    if (!ids) {
      return NextResponse.json({ error: "Projeto ou atividade inválido" }, { status: 400 })
    }

    const files = await projectManagementModule.listActivityFiles({
      ...ids,
      actorId: auth.actor.id,
    })
    return NextResponse.json({ files }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string; activityId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const ids = parseIds(await context.params)
    if (!ids) {
      return NextResponse.json({ error: "Projeto ou atividade inválido" }, { status: 400 })
    }

    // 1. gate antes do corpo (DEC-133 com o gate da DEC-76).
    await projectManagementModule.assertCanRequestActivityCompletion({
      ...ids,
      actorId: auth.actor.id,
    })

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

    const key = newBlobKey(projectActivityFilePrefix(ids.projectId, ids.activityId), file.type)
    await store.put(key, new Uint8Array(await file.arrayBuffer()), file.type)

    // 4. registro, com compensação do objeto se ele falhar.
    try {
      const proof = await projectManagementModule.addActivityFile({
        ...ids,
        actorId: auth.actor.id,
        blobKey: key,
        name: sanitizeDisplayName(file.name),
        contentType: file.type,
        size: file.size,
      })
      return NextResponse.json({ file: proof }, { status: 201 })
    } catch (error) {
      await store.remove(key).catch(() => undefined)
      throw error
    }
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
