import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { BLOB_PDF_CONTENT_TYPE, blobStoreFromEnv } from "@/lib/storage/blob-store"

const { attestation } = getBackendComposition()

/**
 * V5-10a (DEC-171) — `GET /api/projects/[id]/certificates/[certificateId]/file`.
 *
 * Diferente do download do DOCX (leitura aberta), este binário CARREGA O CPF do membro —
 * a folha oficial exige o campo. Por isso o gate (self OU gestão do projeto) roda no use
 * case ANTES de a rota tocar o bucket, e a ordem medida é 404 projeto → 404 certificado →
 * 403 gate: o par (projeto, id) é a chave, id forjado em outro projeto leva 404.
 * O slug `[certificateId]` é o único da posição (gotcha do V5-9b: slug diferente na mesma
 * posição quebra o `next build`).
 */

function invalidId(value: string | null): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; certificateId: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, certificateId } = await context.params
    const projectId = invalidId(id)
    const certificateIdNum = invalidId(certificateId)
    if (projectId === null || certificateIdNum === null) {
      return NextResponse.json({ error: "Identificadores de atestado inválidos" }, { status: 400 })
    }

    const { certificate } = await attestation.getCertificateFile({
      projectId,
      certificateId: certificateIdNum,
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

    const blob = await store.get(certificate.blobKey)
    if (!blob) {
      return NextResponse.json({ error: "Arquivo do atestado não encontrado" }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(blob.body), {
      headers: {
        "Content-Type": blob.contentType ?? BLOB_PDF_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${certificate.fileName}"`,
        "Cache-Control": "private, max-age=0",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao baixar atestado" })
  }
}
