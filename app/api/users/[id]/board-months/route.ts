import { NextRequest, NextResponse } from "next/server"

import { getBackendComposition } from "@/backend/composition/root"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"

const { gamification } = getBackendComposition()

/**
 * GET /api/users/[id]/board-months — plan-v9 S04 (MODELO §7, R12, DEC-232).
 *
 * Os meses fechados de uma pessoa, do mais recente ao mais antigo, para o perfil listar.
 * Leitura do autenticado (R12): é projeção do histórico do quadro, que qualquer autenticado
 * já lê por mês — nada aparece por aqui que `/api/board?month=AAAA-MM` não mostre. Sem gate
 * novo de leitura, e sem gate de gestão: não é a leitura de CPF nem de dado restrito de pessoa
 * (DEC-138/147), é a mesma linha de classificação em outra ordem.
 *
 * `id` numérico é exigido aqui porque é o endereço do recurso (params vira `NaN` não é rota).
 * `userId` inválido dentro do use case segue nomeando o campo (`ValidationError` → 400).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { id } = await params
    const userId = Number(id)
    if (!Number.isInteger(userId) || userId < 1) {
      return NextResponse.json({ error: "id invalido" }, { status: 400 })
    }

    return NextResponse.json(await gamification.readUserBoardMonths(userId))
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao ler os meses do quadro" })
  }
}
