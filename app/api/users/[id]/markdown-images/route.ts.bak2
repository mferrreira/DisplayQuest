import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv, blobRuleFor, normalizeContentType, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"
import { MARKDOWN_IMAGE_ONLY_MESSAGE, userMarkdownImageKey, userActor } from "@/backend/domain"

const { userManagement: userManagementModule } = getBackendComposition()

/**
 * S08 (plan-v21, R13/DEC-263) — `POST /api/users/[id]/markdown-images`.
 *
 * Mesma régua de R11 (S07), aplicada a `users`: o gate é a autoridade do perfil (SELF OU
 * MANAGE_USERS, DEC-137) e corre ANTES de `request.formData()` (DEC-133). Chave
 * `users/<id>/markdown-images/<uuid>.<ext>`, sem registro.
 */

function invalidUser() {
  return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const userId = Number((await context.params).id)
    if (!Number.isInteger(userId) || userId <= 0) return invalidUser()

    // 1. gate antes do corpo: 404 do usuário, depois o 403 self-ou-MANAGE_USERS.
    await userManagementModule.assertCanUpdateUserBio({ actor: userActor(auth.actor.id, auth.actor.roles), userId })

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

    const bytes = new Uint8Array(await file.arrayBuffer())
    const key = userMarkdownImageKey(userId, randomUUID(), rule.extension)
    await store.put(key, bytes, normalizeContentType(file.type))
    const basename = key.split("/").pop() as string
    return NextResponse.json({
      key,
      url: `/api/users/${userId}/markdown-images/${basename}?v=${key}`,
      name: file.name,
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
