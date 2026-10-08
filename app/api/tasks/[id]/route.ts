import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { userActor } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// B6-7 (D4): as decisoes das 4 metodos desta rota desceram para os use cases, na ordem
// medida em cada um:
//  - GET: o escopo (MANAGE_USERS ve tudo; dono ve a sua; terceiro so ve projeto do qual e
//    membro; senao 403 'Acesso negado') mora no GetTaskByIdUseCase. O 404 continua LEGADO
//    verbatim (o use case devolve null, a rota monta o corpo antigo — mesma regra do
//    daily_log no B6-5); o 403 passou ao corpo mapeado (superset, DEC-53).
//  - PUT: o gate de CAMPO (quem nao tem MANAGE_TASKS so edita corpo exclusivamente
//    {status, assignedTo} — 'Sem permissão para editar tarefa') e o filtro allowedFields
//    moram no UpdateTaskUseCase, decididos sobre o corpo CRU antes do lookup.
//  - DELETE: 'Sem permissão para excluir tarefa' (MANAGE_TASKS) mora no DeleteTaskUseCase,
//    antes do lookup — o quirk "gateway sem checagem" estava so no gateway; a rota sempre
//    cobrou esta autoridade (DEC-123).
//  - PATCH complete: o gate cross-actor ('Sem permissão para concluir tarefa para outro
//    usuário') mora no CompleteTaskUseCase. Os 400 de despacho (acao invalida, userId
//    invalido) ficam na rota e continuam ANTES do gate, como medido.
const { taskManagement: taskManagementModule } = getBackendComposition()

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const params = await context.params
    const id = parseInt(params.id)
    const task = await taskManagementModule.getTaskById({ actor, taskId: id })
    if (!task) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ task: task.toJSON() })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar tarefa:", error)
    return NextResponse.json({ error: "Erro ao buscar tarefa" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const params = await context.params
    const id = parseInt(params.id)
    const body = await request.json()

    // o corpo CRU vai ao use case: o gate de campo decide sobre ele e o filtro
    // allowedFields (que era desta rota) passou para dentro junto com o gate
    const task = await taskManagementModule.updateTask({
      actor,
      taskId: id,
      data: body ?? {},
    })
    return NextResponse.json({ task: task.toJSON() })
  } catch (error: any) {
    // OND4-B4 (R4): typed DomainErrors carry their own status (404/403/400/409); the old
    // string heuristics ('not found' never matched the Portuguese messages) are gone.
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar tarefa" }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    const params = await context.params
    const id = parseInt(params.id)
    await taskManagementModule.deleteTask({
      actor,
      taskId: id,
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao excluir tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao excluir tarefa" }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params;
    const id = parseInt(params.id)
    const body = await request.json()
    const { action, userId } = body

    if (action !== "complete") {
      return NextResponse.json({ error: "Ação inválida. Use 'complete' para marcar tarefa como concluída." }, { status: 400 })
    }

    const userToAward = userId ? parseInt(userId) : undefined;
    if (userToAward !== undefined && (Number.isNaN(userToAward) || userToAward <= 0)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    // B6-7: o gate cross-actor (creditar a OUTRO exige MANAGE_TASKS) e o default
    // "premiado = o proprio ator" moram no CompleteTaskUseCase, na ordem medida (depois
    // dos 400 de despacho desta rota, antes do lookup).
    const { task, awardedTo, awardedPoints } = await taskManagementModule.completeTask({
      actor: userActor(auth.actor.id, auth.actor.roles),
      taskId: id,
      userId: userToAward,
    })

    // O valor creditado é decidido pelo domínio (points-rules) e confirmado pelo publisher de
    // gamificação, que devolve o **efetivo** (OND4-A) — inclusive 0 quando o award já existia.
    // Antes desta Onda a rota não sabia o número, e o próprio código registrava isso como
    // limitação aceita; logar `task.points` mentia e continua mentindo (plan-v3 OND1-D).
    console.log(`✅ Task ${id} completed by user ${userToAward ?? auth.actor.id}.`)

    return NextResponse.json({ task: task.toJSON(), awardedTo, awardedPoints })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao completar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao completar tarefa" }, { status: 500 })
  }
}
