import { NextResponse } from 'next/server'
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from '@/lib/auth/api-guard'
import { domainErrorResponse } from '@/lib/api/domain-error-response'
import { CREATE_USER_DENIED_MESSAGE, userActor } from '@/backend/domain'
import { getBackendComposition } from '@/backend/composition/root'

const { userManagement: userManagementModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    // B6-4 (D4): a visibilidade da lista ja morava no use case (resolveUserListVisibility com
    // mensagem congelada); o que desceu foi o ActorRef — a rota entregava `actorRoles` crus,
    // o veredito pre-calculado com outra grafia. O fallback legado de 403 no catch era codigo
    // morto: ForbiddenError ja era mapeado por domainErrorResponse antes mesmo deste lote.
    const users = await userManagementModule.listUsersForActor({
      actor: userActor(auth.actor.id, auth.actor.roles),
    })

    return NextResponse.json({ users }, { status: 200 })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor", exposeMessage: true })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    // B6-4 (D4): o gate MANAGE_USERS mora em CreateUserUseCase; o assert roda ANTES do parse
    // porque a ordem medida e 403-antes-do-corpo (corpo invalido para quem nao pode e 403,
    // nunca 400/500). O use case recheca no mesmo ator.
    const actor = userActor(auth.actor.id, auth.actor.roles)
    userManagementModule.assertCanManageUsers({ actor, deniedMessage: CREATE_USER_DENIED_MESSAGE })

    const body = await request.json()
    const { name, email, password, roles, weekHours } = body

    const user = await userManagementModule.createUser({
      actor,
      name,
      email,
      password,
      roles: roles || [],
      weekHours: weekHours ?? 0,
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error('Erro ao criar usuário:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar usuário' },
      { status: 400 }
    )
  }
}
