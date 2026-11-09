import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"
import { isMarkdownImageName, markdownImageKey, MARKDOWN_IMAGE_NAME_MESSAGE } from "@/backend/domain"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * S07 (plan-v21, R11/DEC-262) — serve o binário de uma imagem da descrição.
 *
 * Leitura aberta ao autenticado: a descrição é aberta (DEC-127), e a URL entra num `<img>`
 * com o cookie da sessão. A chave é recomposta pela rota a partir do projeto + `[name]`, que
 * é exatamente `<uuid>.<ext>` da família — traversal e extensão fora da lista são recusados
 * antes de tocar o bucket. Cache longo e `private`: o uuid torna o endereço imutável.
 */

function invalidProject() {
  return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    if (!Number.isInteger(projectId) || projectId <= 0) return invalidProject()

    // A leitura da descrição é aberta ao autenticado (DEC-127): `getProjectForActor` é o par
    // da tela, e o 404 congela a MESMA frase do use case.
    const project = await projectManagementModule.getProjectForActor({ projectId, actorId: auth.actor.id, actorRoles: auth.actor.roles })
    void project

    if (!isMarkdownImageName(params.name)) {
      return NextResponse.json({ error: MARKDOWN_IMAGE_NAME_MESSAGE }, { status: 400 })
    }

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const dot = params.name.lastIndexOf(".")
    const object = await store.get(markdownImageKey(projectId, params.name.slice(0, dot), params.name.slice(dot + 1)))
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
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}
