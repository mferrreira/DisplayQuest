import { NextResponse } from 'next/server'
import { domainErrorResponse } from '@/lib/api/domain-error-response'
import { getBackendComposition } from '@/backend/composition/root'

const { userManagement: userManagementModule } = getBackendComposition()

/**
 * Public self-registration (OND2-B3, R4). The route no longer talks to Prisma/bcrypt:
 * validation, duplicate check, hashing and the pending-status creation live in
 * RegisterUserUseCase (frozen messages preserved).
 *
 * Status evolution (AC-00-07, documented): duplicate email was a hand-rolled 400; it is now
 * a ConflictError mapped to 409. The transport shape { message, user: {id,name,email,status,
 * createdAt} } and the 201 success are unchanged.
 */
export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json()

    const created = (await userManagementModule.registerUser({ name, email, password })) as {
      id: number
      name: string
      email: string
      status: string
      createdAt?: Date
    }

    // Frozen select-shape of the previous route: {id,name,email,status,createdAt}
    const user = {
      id: created.id,
      name: created.name,
      email: created.email,
      status: created.status,
      createdAt: created.createdAt,
    }

    return NextResponse.json(
      {
        message: 'Conta criada com sucesso! Sua solicitação será analisada por um coordenador ou gerente.',
        user,
      },
      { status: 201 },
    )
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error('Erro no registro:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 },
    )
  }
}
