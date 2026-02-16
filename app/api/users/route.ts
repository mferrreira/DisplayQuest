import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/auth/api-guard'
import { createUserManagementModule } from '@/backend/modules/user-management'

const userManagementModule = createUserManagementModule()

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
