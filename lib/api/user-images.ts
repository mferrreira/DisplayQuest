/**
 * V5-3 (DEC-137) — cliente HTTP da imagem de perfil.
 *
 * Mesma forma de `lib/api/project-files.ts`: fetch tipado por função, erro lido do corpo `{ error }`
 * da rota, upload multipart.
 *
 * A chave ENTRA no tipo (ao contrário do `blobKey` de anexo): é ela que diz se o slot tem imagem e é
 * ela que o navegador leva como quebra de cache, porque o endereço por slot é sempre o mesmo.
 */

export type UserImageSlot = "banner"

export interface UserImageState {
  bannerKey: string | null
}

function readImageState(payload: unknown): UserImageState {
  const user = (payload as { user?: { bannerKey?: string | null } })?.user
  return { bannerKey: user?.bannerKey ?? null }
}

async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new Error(fallback)
  }

  let payload: unknown = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const message = (payload as { error?: unknown })?.error
    throw new Error(typeof message === "string" && message.length > 0 ? message : fallback)
  }
  return payload as T
}

/**
 * URL do binário, servida pela rota autenticada. Funciona num `<img>`: a sessão chega pelo cookie.
 *
 * `cacheKey` é a chave do objeto no bucket. A rota tem `Cache-Control: private` com dia de validade
 * e o endereço por slot nunca muda, então sem o parâmetro o navegador serviria a capa velha depois
 * de trocar a capa. A chave carrega um UUID: muda junto com o objeto.
 */
export function userImageUrl(userId: number, slot: UserImageSlot, cacheKey?: string | null): string {
  const path = `/api/users/${userId}/images/${slot}/file`
  return cacheKey ? `${path}?v=${encodeURIComponent(cacheKey)}` : path
}

export async function uploadUserImage(userId: number, slot: UserImageSlot, file: File): Promise<UserImageState> {
  const form = new FormData()
  form.set("file", file)
  const payload = await request<unknown>(
    `/api/users/${userId}/images/${slot}`,
    { method: "PUT", body: form },
    "Erro ao enviar capa",
  )
  return readImageState(payload)
}

export async function deleteUserImage(userId: number, slot: UserImageSlot): Promise<UserImageState> {
  const payload = await request<unknown>(
    `/api/users/${userId}/images/${slot}`,
    { method: "DELETE" },
    "Erro ao remover capa",
  )
  return readImageState(payload)
}
