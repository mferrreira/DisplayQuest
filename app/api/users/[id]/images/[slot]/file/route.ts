import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { USER_IMAGE_SLOT_MESSAGE, isUserImageSlot, userActor } from "@/backend/domain"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { userManagement: userManagementModule } = getBackendComposition()

/**
 * V5-3 (DEC-137) — serve o binário da capa do perfil. Nunca estático: a sessão chega pelo cookie, o
 * que permite usar a URL direto num `<img>`.
 *
 * Leitura aberta ao autenticado (a mesma política da DEC-127 aplicada ao projeto no V5-2a): o pódio
 * do ranking e o cartão de perfil mostram a capa de qualquer pessoa. Cache longo e `private`: a chave
 * carrega um UUID, então o conteúdo deste endereço nunca muda — trocar a capa muda o endereço.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; slot: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }
    if (!isUserImageSlot(params.slot)) {
      return NextResponse.json({ error: USER_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    const image = await userManagementModule.getUserImage({
      actor: userActor(auth.actor.id, auth.actor.roles),
      userId,
      slot: params.slot,
    })

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const object = await store.get(image.blobKey)
    if (!object) {
      return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao servir imagem" })
  }
}
