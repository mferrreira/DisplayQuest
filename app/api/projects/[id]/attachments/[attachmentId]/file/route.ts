import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * V5-2c (DEC-101) — serve o binário do anexo. Mesma postura da A11 para os relatórios: o blob
 * nunca é estático, e a regra de acesso é a do projeto (o `getProjectAttachment` decide), não
 * a posse do arquivo.
 */

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const projectId = Number(params.id)
    const attachmentId = Number(params.attachmentId)
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(attachmentId) || attachmentId <= 0) {
      return NextResponse.json({ error: "Projeto ou anexo inválido" }, { status: 400 })
    }

    const attachment = await projectManagementModule.getProjectAttachment({
      projectId,
      attachmentId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const object = await store.get(attachment.blobKey)
    if (!object) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    }

    // `filename*` porque o nome é português e pode ter acento: `filename="Relação.pdf"`
    // quebraria em aspas/latin1.
    return new NextResponse(new Uint8Array(object.body), {
      status: 200,
      headers: {
        "Content-Type": attachment.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao servir arquivo" })
  }
}
