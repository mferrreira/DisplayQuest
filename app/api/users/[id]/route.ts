import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
// B6-4 (D4): as 3 decisoes desta rota desceram para os use cases —
//   GET:    self || MANAGE_USERS ("Acesso negado") em FindUserByIdUseCase; o 404 legado {error}
//           e preservado (null do use case, corpo montado aqui como antes).
//   PUT:    self || MANAGE_USERS + a TRAVA DE CAMPOS (filterSelfEditableUserFields) em
//           UpdateUserUseCase — o `Object.fromEntries` inline da rota era escopo na camada HTTP.
//   DELETE: MANAGE_USERS PURO em DeleteUserUseCase (excluir nao e caminho self — DEC-55).
// A validacao do id (400 "Usuário inválido") continua na rota, antes do gate, como medido.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const user = await userManagementModule.findUserById(actor, id)
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar usuário" })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const actor = userActor(auth.actor.id, auth.actor.roles)
    const user = await userManagementModule.updateUser(actor, id, body)
    return NextResponse.json({ user })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar usuário", exposeMessage: true })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 })
    }

    const actor = userActor(auth.actor.id, auth.actor.roles)
    await userManagementModule.deleteUser(actor, id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao excluir usuário", exposeMessage: true })
  }
}
