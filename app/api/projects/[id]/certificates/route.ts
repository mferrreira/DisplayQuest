import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { BLOB_PDF_CONTENT_TYPE, blobStoreFromEnv } from "@/lib/storage/blob-store"

const { attestation } = getBackendComposition()

/**
 * V5-10a (DEC-75/130/133/170/171) — `GET/POST /api/projects/[id]/certificates`.
 *
 * GET: a lista é leitura aberta do autenticado (filho de projeto, regra 13) e só METADADO
 * — o CPF está no PDF, e o PDF só sai pela rota gateada do arquivo.
 *
 * POST: gerar o atestado de um membro. O gate (self OU gestão) e a aritmética do mês
 * moram no use case, com a ordem medida 404 → 403 → 400 → 404; a rota autentica, valida a
 * entrada, monta o ator, chama o módulo e SÓ então move byte ao bucket pelo seam (DEC-133)
 * — quem não pode gerar recebe o 403 antes de qualquer objeto nascer. Sem bucket no
 * ambiente, 503 com a mesma frase das rotas de anexo/DOCX.
 */

function invalidId(value: string | null): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id } = await context.params
    const projectId = invalidId(id)
    if (projectId === null) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const certificates = await attestation.listCertificates({ projectId })
    return NextResponse.json({
      certificates: certificates.map((certificate) => ({
        id: certificate.id,
        userId: certificate.userId,
        month: certificate.month,
        fileName: certificate.fileName,
        generatedBy: certificate.generatedBy,
        createdAt: certificate.createdAt,
        updatedAt: certificate.updatedAt,
      })),
    })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao listar atestados" })
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id } = await context.params
    const projectId = invalidId(id)
    if (projectId === null) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const userId = invalidId(body?.userId != null ? String(body.userId) : null)
    if (userId === null) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }
    const month = typeof body?.month === "string" ? body.month : undefined

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const { certificate, pdfBytes, warnings } = await attestation.generateCertificate({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
      userId,
      month,
      now: new Date(),
    })

    await store.put(certificate.blobKey, pdfBytes, BLOB_PDF_CONTENT_TYPE)

    return NextResponse.json(
      {
        certificate: {
          id: certificate.id,
          userId: certificate.userId,
          month: certificate.month,
          fileName: certificate.fileName,
          generatedBy: certificate.generatedBy,
          createdAt: certificate.createdAt,
          updatedAt: certificate.updatedAt,
        },
        warnings,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao gerar atestado" })
  }
}
