import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { USER_IMAGE_SLOT_MESSAGE, isUserImageSlot, userActor, userImagePrefix } from "@/backend/domain"
import { blobStoreFromEnv, isImageBlobContentType, newBlobKey, validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"

const { userManagement: userManagementModule } = getBackendComposition()

/**
 * V5-3 (DEC-137) — capa do perfil no bucket: `PUT` sobe/troca, `DELETE` tira.
 *
 * Mesma forma medida no V5-2d para o projeto (DEC-133): autorizar ANTES de ler o corpo, validar pelo
 * seam, escrever o objeto, escrever o registro; trocar deixa objeto para trás (o use case devolve a
 * chave anterior e a rota a remove); se a gravação do registro falhar, o objeto NOVO é removido.
 *
 * Autoridade é o use case (`self OU MANAGE_USERS`, a mesma do perfil — B6-4): a rota autentica,
 * valida entrada, monta o ator e mapeia. O `assertCanUpdateUserImage` existe só porque upload é o
 * corpo caro — sem ele, quem não pode escrever empurraria bytes ao bucket antes do 403.
 */

/** Id e slot: os dois são entrada do usuário e os dois são recusados com mensagem de rota ou do domínio. */
function parseParams(context: { params: Promise<{ id: string; slot: string }> }) {
  return context.params.then((params) => {
    const userId = Number(params.id)
    return {
      userId,
      validUser: Number.isInteger(userId) && userId > 0,
      // `null` é o slot que não é um dos conhecidos: 400 com a mensagem do domínio, e o tipo
      // estreito impede de levar um `string` cru para o use case.
      slot: isUserImageSlot(params.slot) ? params.slot : null,
    }
  })
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; slot: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { userId, slot, validUser } = await parseParams(context)
    if (!validUser) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }
    if (!slot) {
      return NextResponse.json({ error: USER_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanUpdateUserImage({ actor, userId })

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })
    }

    if (!isImageBlobContentType(file.type)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido para imagem de perfil: ${file.type || "desconhecido"}` },
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

    const key = newBlobKey(userImagePrefix(userId, slot), file.type)
    await store.put(key, new Uint8Array(await file.arrayBuffer()), file.type)

    try {
      const result = await userManagementModule.updateUserImage({ actor, userId, slot, blobKey: key })
      if (result.previousKey) {
        await store.remove(result.previousKey).catch(() => undefined)
      }
      return NextResponse.json({ user: result.user }, { status: 200 })
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

    const { userId, slot, validUser } = await parseParams(context)
    if (!validUser) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }
    if (!slot) {
      return NextResponse.json({ error: USER_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanUpdateUserImage({ actor, userId })

    const result = await userManagementModule.updateUserImage({ actor, userId, slot, blobKey: null })

    // Sem bucket configurado a coluna continua tirável: o registro é a verdade, o objeto é o que
    // sobrou de um ambiente que não tem bucket.
    const store = blobStoreFromEnv()
    if (store && result.previousKey) {
      await store.remove(result.previousKey).catch(() => undefined)
    }

    return NextResponse.json({ user: result.user }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
