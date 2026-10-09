import { NextRequest, NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { taskManagement: taskManagementModule } = getBackendComposition()

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const taskId = parseInt(params.id)
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "ID de tarefa inválido" }, { status: 400 })
    }

    const { task, awardedTo, awardedPoints } = await taskManagementModule.approveTask({
      taskId,
      approverId: auth.actor.id,
    })

    // plan-v3 OND4-A: o prêmio creditado agora, do servidor. `awardedTo` é o responsável pela
    // tarefa — quase nunca quem aprovou (autoaprovação é proibida sem MANAGE_USERS) — e é por
    // isso que os dois campos viajam juntos: o cliente só anima o próprio contador quando quem
    // ganhou foi a pessoa logada.
    return NextResponse.json({
      success: true,
      message: "Tarefa aprovada com sucesso",
      task: task.toJSON(),
      awardedTo,
      awardedPoints,
    }, { status: 200 })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao aprovar tarefa:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Erro ao aprovar tarefa" 
    }, { status: 500 })
  }
}
