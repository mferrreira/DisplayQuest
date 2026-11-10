import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv, blobRuleFor, normalizeContentType, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"
import { markdownImageKey, MARKDOWN_IMAGE_ONLY_MESSAGE } from "@/backend/domain"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S07 (plan-v21, R11/DEC-262) — `POST /api/projects/[id]/markdown-images`.
 *
 * Imagem da descrição: sem registro, o binário é o dado. Régua medida e congelada:
 *   1. 401 → 404 projeto → gate R9 (gestão OU membro ATIVO, DEC-261) — o gate corre ANTES
 *      de `request.formData()` (DEC-133).
 *   2. Só imagem: PDF é blob válido do bucket e não entra no texto. Teto 5 MB, magic bytes e
 *      allowlist são do seam, não da rota.
 *   3. Chave `projects/<id>/markdown-images/<uuid>.<ext>`; nenhum outro caminho de escrita.
 */

function invalidProject() {
  return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projectId = Number((await context.params).id)
    if (!Number.isInteger(projectId) || projectId <= 0) return invalidProject()

    // 1. gate antes do corpo.
    await projectManagementModule.assertCanUpdateProjectDescription({ projectId, actorId: auth.actor.id })

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
    const rule = blobRuleFor(normalizeContentType(file.type))
    if (!rule || rule.kind !== "image") {
      return NextResponse.json({ error: MARKDOWN_IMAGE_ONLY_MESSAGE }, { status: 400 })
    }

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    // 3. bucket. Sem registro: a chave é a identidade do arquivo.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const key = markdownImageKey(projectId, randomUUID(), rule.extension)
    await store.put(key, bytes, normalizeContentType(file.type))
    const basename = key.split("/").pop() as string
    return NextResponse.json({
      key,
      url: `/api/projects/${projectId}/markdown-images/${basename}?v=${key}`,
      name: file.name,
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
