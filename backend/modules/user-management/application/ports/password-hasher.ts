/**
 * PasswordHasher — port of the password-hashing concern (OND2-B2, R2).
 *
 * Hashing is infrastructure, not domain: the use cases decide WHEN a password is set and
 * validate its shape; the adapter decides HOW it is stored (bcrypt today, with the current
 * cost factors: 12 on registration, 10 on profile change — frozen by the golden matrix).
 */
export interface PasswordHasher {
  hash(plain: string, rounds: number): Promise<string>;
}
