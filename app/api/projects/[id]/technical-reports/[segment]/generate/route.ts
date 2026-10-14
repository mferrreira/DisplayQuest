import { NextRequest, NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { BLOB_DOCX_CONTENT_TYPE, blobStoreFromEnv } from "@/lib/storage/blob-store"

const { reporting: reportingModule } = getBackendComposition()

/**
 * V5-9b (DEC-129/133/139/167) — `POST /api/projects/[id]/technical-reports/[segment]/generate`.
 *
 * O slug do segmento e `segment` nos dois filhos (generate e file) porque o Next 15
 * recusa slug diferentes na mesma posicao de rota dinamica ('reportId' !== 'type' quebrou
 * o `next build`, medido 2026-10-14); aqui o segmento e o TIPO de relatorio e o handler
 * valida contra a lista fechada do dominio (via use case).
 *
 * Geração lote: um DOCX oficial preenchido por membro ATIVO (DEC-139). O gate
 * "gestão/líder" mora no use case, com a ordem medida 404 → 403 → 400 → 404 → 409; a
 * rota autentica, monta o ator, chama o módulo e SÓ então move byte ao bucket pelo seam
 * (DEC-133) — quem não pode gera recebe o 403 antes de qualquer objeto nascer. Sem
 * bucket no ambiente, 503 com a mesma frase do anexo de projeto.
 */

function invalidId(value: string | null) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; segment: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id, segment } = await context.params
    const projectId = invalidId(id)
    if (projectId === null) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const store = blobStoreFromEnv()
    if (!store) {
      return NextResponse.json(
        { error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" },
        { status: 503 },
      )
    }

    const { files } = await reportingModule.generateTechnicalReport({
      projectId,
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
      type: segment,
      now: new Date(),
    })

    for (const file of files) {
      await store.put(file.key, file.bytes, BLOB_DOCX_CONTENT_TYPE)
    }

    return NextResponse.json(
      {
        files: files.map((file) => ({
          userId: file.userId,
          memberName: file.memberName,
          key: file.key,
          fileName: file.fileName,
        })),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao gerar relatórios técnicos" })
  }
}
