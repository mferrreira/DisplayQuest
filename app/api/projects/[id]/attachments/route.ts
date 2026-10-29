import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { projectAttachmentPrefix } from "@/backend/domain"
import { blobStoreFromEnv, newBlobKey, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"
import { sanitizeDisplayName } from "@/lib/storage/display-name"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-2c (DEC-101) — anexos do projeto: `GET` lista o metadado, `POST` sobe um arquivo.
 *
 * Ordem medida, não decorativa:
 *   1. autorizar a gestão ANTES de ler o corpo (`AssertCanManageProjectUseCase`, padrão do
 *      B6-2b/DEC-54 com o custo invertido — aqui o corpo é um arquivo). Sem isso, quem não
 *      gerencia empurraria bytes no bucket e só depois receberia o 403.
 *   2. validar tipo/tamanho/assinatura pelo seam (`lib/storage/blob-store.ts`), que é dono da
 *      allowlist e da tabela de magic bytes — a mesma do anexo de relatório.
 *   3. escrever o objeto no bucket (regra 12 do plano: nenhum blob novo em pasta do backend).
 *   4. escrever o registro no módulo. Se o registro falhar, o objeto é removido: o bucket não
 *      fica com um órfão que nenhuma tela alcança.
 */

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const attachments = await projectManagementModule.listProjectAttachments({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })
    return NextResponse.json({ attachments }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
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

    const key = newBlobKey(projectAttachmentPrefix(projectId), file.type)
    await store.put(key, new Uint8Array(await file.arrayBuffer()), file.type)

    // 4. registro, com compensação do objeto se ele falhar.
    try {
      const attachment = await projectManagementModule.addProjectAttachment({
        projectId,
        actorId: auth.actor.id,
        blobKey: key,
        name: sanitizeDisplayName(file.name),
        contentType: file.type,
        size: file.size,
      })
      return NextResponse.json({ attachment }, { status: 201 })
    } catch (error) {
      await store.remove(key).catch(() => undefined)
      throw error
    }
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
