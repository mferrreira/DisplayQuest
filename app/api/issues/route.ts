import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"

const { labOperations: labOperationsModule } = getBackendComposition();

// GET: Obter todos os issues
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");
    const reporterId = searchParams.get("reporterId");
    const assigneeId = searchParams.get("assigneeId");
    const search = searchParams.get("search");

    const issues = await labOperationsModule.listIssues({
      status: status || undefined,
      priority: priority || undefined,
      category: category || undefined,
      reporterId: reporterId ? parseInt(reporterId) : undefined,
      assigneeId: assigneeId ? parseInt(assigneeId) : undefined,
      search: search || undefined,
    });

    return NextResponse.json({ issues });
  } catch (error) {
    console.error("Erro ao buscar issues:", error);
    return NextResponse.json({ error: "Erro ao buscar issues" }, { status: 500 });
  }
}

// POST: Criar um novo issue
export async function POST(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const body = await request.json();

    const issue = await labOperationsModule.createIssue({
      ...body,
      reporterId: auth.actor.id,
    });
    return NextResponse.json({ issue }, { status: 201 });
  } catch (error: any) {
    console.error("Erro ao criar issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao criar issue" }, { status: 500 });
  }
}
