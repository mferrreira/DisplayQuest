import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { USER_IMAGE_SLOT_MESSAGE, clampBannerCrop, isUserImageSlot, userActor } from "@/backend/domain"

const { userManagement: userManagementModule } = getBackendComposition()

/**
 * plan-v12 (DEC-239) — parâmetros do recorte da capa do perfil:
 * `PUT /api/users/<id>/images/banner/crop`.
 *
 * Mesma forma medida no upload do V5-3 (DEC-137): o gate do perfil (`self OU MANAGE_USERS`,
 * `PROFILE_DENIED_MESSAGE`) roda ANTES de o corpo ser lido, a rota autentica, valida entrada,
 * monta o ator e mapeia com `routeErrorResponse`. Nenhum byte é movido aqui — o recorte é
 * parâmetro (DEC-239), o original fica no bucket na mesma chave. A rota clampa por
 * `clampBannerCrop` e o use case escreve o que recebeu.
 */

/** Id e slot: os dois são entrada do usuário, e os dois são recusados antes do corpo. */
function parseParams(context: { params: Promise<{ id: string; slot: string }> }) {
  return context.params.then((params) => {
    const userId = Number(params.id)
    return {
      userId,
      validUser: Number.isInteger(userId) && userId > 0,
      // O recorte só existe para a faixa de capa. Slot fora da lista fechada: 400 com a
      // mensagem do domínio, mesma forma do upload.
      slot: isUserImageSlot(params.slot) ? params.slot : null,
    }
  })
}

const CROP_INVALID_MESSAGE = "Recorte inválido"

/**
 * Entrada estrita: três números. Centro em [0, 1] e zoom ≥ 1 — fora disso é entrada inválida
 * (400), não matéria de clamp. Zoom acima de 4 entra no intervalo pelo clamp; centro fora da
 * janela que o zoom permite entra na janela pelo clamp.
 */
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

    const { userId, validUser, slot } = await parseParams(context)
    if (!validUser) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }
    if (!slot) {
      return NextResponse.json({ error: USER_IMAGE_SLOT_MESSAGE }, { status: 400 })
    }

    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanUpdateUserImage({ actor, userId })

    const body = await request.json().catch(() => null)
    const params = parseCropBody(body)
    if (!params) {
      return NextResponse.json({ error: CROP_INVALID_MESSAGE }, { status: 400 })
    }

    const user = await userManagementModule.updateUserBannerCrop({
      actor,
      userId,
      params: clampBannerCrop(params),
    })
    return NextResponse.json({ user }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro ao gravar o recorte da capa" })
  }
}
