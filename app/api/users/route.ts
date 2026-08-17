import { NextResponse } from 'next/server'
import { requireApiActor, ensurePermission } from '@/lib/auth/api-guard'
import { createUserManagementModule } from '@/backend/modules/user-management'
import { getBackendComposition } from "@/backend/composition/root"

const { userManagement: userManagementModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const users = await userManagementModule.listUsersForActor({
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json({ users }, { status: 200 })
  } catch (error: any) {
    console.error('Erro na API de usuários:', error)
    if (error?.message?.includes('não tem permissão')) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    return NextResponse.json(
      { error: error.message || 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const permissionError = ensurePermission(auth.actor, "MANAGE_USERS", "Sem permissão para criar usuários")
    if (permissionError) return permissionError

    const body = await request.json()
    const { name, email, password, roles, weekHours } = body

    const user = await userManagementModule.createUser({
      name,
      email,
      password,
      roles: roles || [],
      weekHours: weekHours ?? 0,
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error: any) {
    console.error('Erro ao criar usuário:', error)
    return NextResponse.json(
      { error: error.message || 'Erro ao criar usuário' },
      { status: 400 }
    )
  }
}
