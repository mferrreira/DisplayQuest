import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { gamification: gamificationModule } = getBackendComposition()

/**
 * plan-v16 S02 (R2, DEC-243) — serve o binário do ícone do badge.
 *
 * Mesma postura das capas (V5-2d/V5-3): rota autenticada, `private, max-age=86400` porque a
 * chave carrega UUID e o conteúdo deste endereço nunca muda. A lista de badges é leitura
 * aberta hoje, e o binário segue o autenticado — id forjado não acha objeto, e badge sem
 * chave responde 404 com a mensagem própria: a rota não inventa caminho.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Badge inválido" }, { status: 400 })
    }

    const badge = await gamificationModule.getBadgeById(id)
    if (!badge) {
      return NextResponse.json({ error: "Badge não encontrado" }, { status: 404 })
    }
    if (!badge.iconKey) {
      return NextResponse.json({ error: "Ícone não encontrado" }, { status: 404 })
    }

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const object = await store.get(badge.iconKey)
    if (!object) {
      return NextResponse.json({ error: "Ícone não encontrado" }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": object.contentType || "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao servir o ícone do badge" })
  }
}
