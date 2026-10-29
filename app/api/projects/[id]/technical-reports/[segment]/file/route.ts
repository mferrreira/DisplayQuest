import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { BLOB_DOCX_CONTENT_TYPE, blobStoreFromEnv } from "@/lib/storage/blob-store"
import { technicalReportFileKey } from "@/backend/domain"

/**
 * V5-9b (DEC-101/127/133/167) — `GET /api/projects/[id]/technical-reports/[segment]/file?userId=N`.
 *
 * O slug do segmento e `segment` nos dois filhos (generate e file) porque o Next 15
 * recusa slug diferentes na mesma posicao de rota dinamica; aqui o segmento e o
 * `reportId` numerico e o handler valida.
 *
 * Entrega do DOCX gerado. Leitura aberta ao autenticado: relatório técnico é filho de
 * projeto e herda a leitura da regra 13 do plano (DEC-127/136) — o binário sai por rota
 * autenticada, como a capa do projeto (DEC-135). A chave é DERIVADA do par e do membro
 * (DEC-167): id forjado simplesmente não acha objeto e leva 404. `Cache-Control` sem
 * max-age longo porque a chave é estável e regenerar sobrescreve o objeto.
 */

function invalidId(value: string | null) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; segment: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, segment } = await context.params
    const projectId = invalidId(id)
    const reportIdNum = invalidId(segment)
    const userId = invalidId(request.nextUrl.searchParams.get("userId"))
    if (projectId === null || reportIdNum === null || userId === null) {
      return NextResponse.json({ error: "Identificadores de relatório inválidos" }, { status: 400 })
    }

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const blob = await store.get(technicalReportFileKey(projectId, reportIdNum, userId))
    if (!blob) {
      return NextResponse.json(
        { error: "Arquivo ainda não gerado — gere o documento a partir do texto salvo" },
        { status: 404 },
      )
    }

    return new NextResponse(new Uint8Array(blob.body), {
      headers: {
        "Content-Type": blob.contentType ?? BLOB_DOCX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="relatorio-tecnico-${reportIdNum}-${userId}.docx"`,
        "Cache-Control": "private, max-age=0",
      },
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao baixar relatório técnico" })
  }
}
