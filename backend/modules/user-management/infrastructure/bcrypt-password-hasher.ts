/**
 * BcryptPasswordHasher — adapter of the PasswordHasher port (OND2-B2).
 * bcryptjs with the current cost factors chosen by the use cases (12 register / 10 profile).
 */
import bcrypt from "bcryptjs"
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher"

export class BcryptPasswordHasher implements PasswordHasher {
  async hash(plain: string, rounds: number): Promise<string> {
    return await bcrypt.hash(plain, rounds)
  }
}

export function createBcryptPasswordHasher(): BcryptPasswordHasher {
  return new BcryptPasswordHasher()
}
