import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"
import { isMarkdownImageName, PROFILE_DENIED_MESSAGE, userActor, userMarkdownImageKey, MARKDOWN_IMAGE_NAME_MESSAGE } from "@/backend/domain"

const { userManagement: userManagementModule } = getBackendComposition()

/**
 * S08 (plan-v21, R13/DEC-263) — serve o binário de uma imagem da bio.
 *
 * Leitura aberta ao autenticado, como a bio na tela de perfil: a sessão chega pelo cookie e a
 * URL entra num `<img>`. O `[name]` é exatamente `<uuid>.<ext>` da família — traversal é
 * recusado antes de tocar o bucket. O usuário precisa existir, e o par de visibilidade do
 * perfil (DEC-178) decide o 403 para o privado.
 */

function invalidUser() {
  return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) return invalidUser()

    if (!isMarkdownImageName(params.name)) {
      return NextResponse.json({ error: MARKDOWN_IMAGE_NAME_MESSAGE }, { status: 400 })
    }

    // O lookup decide existência e visibilidade com a MESMA regra da tela de perfil.
    const user = await userManagementModule.findUserById(userActor(auth.actor.id, auth.actor.roles), userId, PROFILE_DENIED_MESSAGE)
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const dot = params.name.lastIndexOf(".")
    const object = await store.get(userMarkdownImageKey(userId, params.name.slice(0, dot), params.name.slice(dot + 1)))
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
    console.log("DBG catch", (error as { message?: string; constructor: { name: string } })?.constructor?.name, (error as { message?: string })?.message)
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
