import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { PROJECT_IMAGE_SLOT_MESSAGE, SQUARE_BAND_ASPECT, clampBannerCrop, clampCropCenterToBand, isProjectImageSlot } from "@/backend/domain"

const { projectManagement: projectManagementModule } = getBackendComposition()

/**
 * plan-v12 (DEC-239) + DEC-242 — parâmetros do recorte do projeto:
 * `PUT /api/projects/<id>/images/<slot>/crop`, com slot `banner` (faixa 21:9) ou `logo` (quadrado).
 *
 * Mesma forma medida no caminho do perfil (DEC-239): o gate de gestão do projeto
 * (`assertCanManageProject` — ACL do vínculo) roda ANTES de o corpo ser lido; nenhum byte é
 * movido — o recorte é parâmetro, o original fica no bucket na mesma chave. A rota clampa e o
 * use case escreve o que recebeu: para a capa, a janela de centro de `clampBannerCrop`; para o
 * logo quadrado, o clamp band-aware com a razão 1 (banda quadrada, mesma janela medida de centro).
 */

function parseSlot(context: { params: Promise<{ id: string; slot: string }> }) {
  return context.params.then((params) => {
    const projectId = Number(params.id)
    return {
      projectId,
      validProject: Number.isInteger(projectId) && projectId > 0,
      slot: isProjectImageSlot(params.slot) ? params.slot : null,
    }
  })
}

const CROP_INVALID_MESSAGE = "Recorte inválido"

/** Entrada estrita, a mesma da rota de perfil: centro em [0, 1] e zoom ≥ 1. */
function parseCropBody(raw: unknown): { x: number; y: number; zoom: number } | null {
  if (typeof raw !== "object" || raw === null) return null
  const { x, y, zoom } = raw as Record<string, unknown>
  if (typeof x !== "number" || typeof y !== "number" || typeof zoom !== "number") return null
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  if (zoom < 1) return null
  return { x, y, zoom }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; slot: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { projectId, validProject, slot } = await parseSlot(context)
    if (!validProject) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }
    if (!slot) {
      return NextResponse.json({ error: PROJECT_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    // Gate antes do corpo, a mesma ordem medida no upload do V5-2d.
    await projectManagementModule.assertCanManageProject({ projectId, actorId: auth.actor.id })

    const body = await request.json().catch(() => null)
    const params = parseCropBody(body)
    if (!params) {
      return NextResponse.json({ error: CROP_INVALID_MESSAGE }, { status: 400 })
    }

    // DEC-242: o logo tem faixa quadrada (razão 1) — o clamp band-aware com razão 1 dá a
    // mesma janela de centro que `clampBannerCrop`; a capa segue `clampBannerCrop`.
    const paramsForSlot =
      slot === "logo"
        ? clampCropCenterToBand(params, SQUARE_BAND_ASPECT, SQUARE_BAND_ASPECT)
        : clampBannerCrop(params)

    const result =
      slot === "logo"
        ? await projectManagementModule.updateProjectLogoCrop({ projectId, actorId: auth.actor.id, params: paramsForSlot })
        : await projectManagementModule.updateProjectBannerCrop({ projectId, actorId: auth.actor.id, params: paramsForSlot })
    return NextResponse.json({ project: result }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao gravar o recorte da capa do projeto" })
  }
}
