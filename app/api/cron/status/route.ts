import { NextResponse } from "next/server";
import { cronService } from "@/lib/services/cron-service";
import { ensureAnyRole, requireApiActor } from "@/lib/auth/api-guard";

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const accessError = ensureAnyRole(auth.actor, ["COORDENADOR"], "Apenas coordenadores podem acessar.")
    if (accessError) return accessError

    const status = cronService.getStatus();
    return NextResponse.json({ status });
  } catch (error: any) {
    console.error("Erro ao buscar status do cron:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const accessError = ensureAnyRole(auth.actor, ["COORDENADOR"], "Apenas coordenadores podem acessar.")
    if (accessError) return accessError

    const body = await request.json();
    const { action } = body;

    if (action === "manual-reset") {
      await cronService.executeManualReset();
      return NextResponse.json({ 
        message: "Reset manual executado com sucesso"
      });
    }

    return NextResponse.json({ error: "Ação não reconhecida" }, { status: 400 });
  } catch (error: any) {
    console.error("Erro ao executar ação do cron:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
