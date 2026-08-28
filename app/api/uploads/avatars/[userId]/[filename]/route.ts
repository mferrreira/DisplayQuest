import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"

// Avatares são gravados em public/uploads/avatars/{userId}/ em runtime.
// O Next standalone só serve de public/ o que existia no boot do servidor
// (cache da listagem), então um arquivo recém-uploaded dava 404 até o
// próximo deploy/restart. Esta rota lê do disco a cada request.
// Os demais uploads (ex.: anexos de relatório) já usam route handlers.
export const dynamic = "force-dynamic"

const AVATARS_ROOT = join(process.cwd(), "public", "uploads", "avatars")

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string; filename: string }> }
) {
  try {
    const { userId, filename } = await context.params

    // Padrões estritos: userId numérico e nome gerado por ImageProcessor
    // (avatar_<timestamp>.webp). Bloqueia path traversal e leitura arbitrária.
    if (!/^\d+$/.test(userId) || !/^avatar_\d+\.webp$/.test(filename)) {
      return NextResponse.json({ error: "Avatar não encontrado" }, { status: 404 })
    }

    const bytes = await readFile(join(AVATARS_ROOT, userId, filename))

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return NextResponse.json({ error: "Avatar não encontrado" }, { status: 404 })
  }
}