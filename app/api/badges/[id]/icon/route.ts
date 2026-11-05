import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { assertPermission, badgeIconPrefix } from "@/backend/domain"
import { blobStoreFromEnv, isImageBlobContentType, newBlobKey, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"
import { ImageProcessor } from "@/lib/utils/image-processor"

const { gamification: gamificationModule } = getBackendComposition()

/**
 * plan-v16 S03 (R3/R4, DEC-243, INV1-INV5) — `PUT` sobe o ícone do badge, `DELETE` o remove.
 *
 * Ordem medida, a mesma das capas e dos anexos (DEC-133): autorizar antes de ler o corpo,
 * validar pelo seam (allowlist de imagem + magic bytes + teto), converter a WebP, escrever o
 * objeto, escrever o registro. O gate é o MESMO da gestão de badges (a mensagem congelada do
 * CRUD, "Sem permissão para atualizar badges", DEC-53) e corre antes do lookup do badge, que
 * é o par 403-antes-do-404 medido. O que entra no bucket é o byte CONVERTIDO, nunca o `.png`
 * do upload (R12 das capas, `ImageProcessor.toWebP`). Trocar apaga o objeto velho só depois
 * de o registro apontar para o novo; registro falhando remove o objeto NOVO.
 */

function parseId(context: { params: Promise<{ id: string }> }) {
  return context.params.then((params) => {
    const id = Number(params.id)
    return { id, valid: Number.isInteger(id) && id > 0 }
  })
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, valid } = await parseId(context)
    if (!valid) {
      return NextResponse.json({ error: "Badge inválido" }, { status: 400 })
    }

    // Gate antes do corpo: upload é o corpo caro (DEC-133), e o gate é o da gestão de badges.
    assertPermission(auth.actor.roles, "MANAGE_REWARDS", "Sem permissão para atualizar badges")

    const badge = await gamificationModule.getBadgeById(id)
    if (!badge) {
      return NextResponse.json({ error: "Badge não encontrado" }, { status: 404 })
    }

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })
    }

    if (!isImageBlobContentType(file.type)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido para ícone de badge: ${file.type || "desconhecido"}` },
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

    const webp = await ImageProcessor.toWebP(Buffer.from(await file.arrayBuffer()))
    const key = newBlobKey(badgeIconPrefix(id), "image/webp")
    await store.put(key, webp, "image/webp")

    try {
      const updated = await gamificationModule.updateBadge({
        id,
        data: { iconKey: key },
        actorRoles: auth.actor.roles,
      })
      // A imagem antiga só sai do bucket depois que o registro aponta para a nova.
      if (badge.iconKey) {
        await store.remove(badge.iconKey).catch(() => undefined)
      }
      return NextResponse.json({ success: true, iconKey: updated.iconKey, badge: updated }, { status: 200 })
    } catch (error) {
      await store.remove(key).catch(() => undefined)
      throw error
    }
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao subir o ícone do badge" })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, valid } = await parseId(context)
    if (!valid) {
      return NextResponse.json({ error: "Badge inválido" }, { status: 400 })
    }

    assertPermission(auth.actor.roles, "MANAGE_REWARDS", "Sem permissão para atualizar badges")

    const badge = await gamificationModule.getBadgeById(id)
    if (!badge) {
      return NextResponse.json({ error: "Badge não encontrado" }, { status: 404 })
    }

    if (badge.iconKey) {
      const store = blobStoreFromEnv()
      if (!store) {
        return NextResponse.json(
          { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
          { status: 503 },
        )
      }
      await store.remove(badge.iconKey)
    }

    const updated = await gamificationModule.updateBadge({
      id,
      data: { iconKey: null },
      actorRoles: auth.actor.roles,
    })
    return NextResponse.json({ success: true, badge: updated }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao remover o ícone do badge" })
  }
}
