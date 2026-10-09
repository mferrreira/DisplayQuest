/**
 * DomainError — the typed business-error contract of the pure core (SPEC §1.5, RG-11).
 *
 * Why this exists: today a denied access or a missing row is a `throw new Error("...")`
 * thrown from an infrastructure gateway and swallowed by a route as a 500. That makes the
 * HTTP status an accident instead of a contract (AC-00-07).
 *
 * A DomainError carries its OWN stable status and code. Routes map it; they do not invent it.
 * This file is pure: no framework, no HTTP library, no ORM (RG-01 — gate rule
 * `rg01-domain-core-no-external`).
 */

export interface DomainErrorOptions {
  /** Machine-readable, stable across releases. Defaults per subclass. */
  code?: string;
  /** Optional context a route may surface (ids, field names). Never a secret. */
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Base class. `status` is the HTTP status the adapter maps this condition to — it is part of
 * the domain contract, not a transport detail.
 *
 * `name` is passed explicitly by every subclass: production builds mangle class identifiers,
 * so deriving it from `new.target.name` would make the transport contract change between dev
 * and prod. `new.target.prototype` is still used to keep `instanceof` correct down-level.
 */
export abstract class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, name: string, message: string, options: DomainErrorOptions = {}) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = name;
    this.status = status;
    this.code = options.code ?? name.toUpperCase();
    this.details = options.details ?? {};
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }

  /** Transport shape used by route adapters (AC-00-07). */
  toJSON(): { error: string; code: string; details: Record<string, unknown> } {
    return { error: this.message, code: this.code, details: this.details };
  }
}

/** 400 — the input is not acceptable (missing title, negative points, ...). */
export class ValidationError extends DomainError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super(400, "ValidationError", message, { code: "VALIDATION_ERROR", ...options });
  }
}

/** 401 — the actor is not authenticated. */
export class UnauthorizedError extends DomainError {
  constructor(message = "Não autenticado", options: DomainErrorOptions = {}) {
    super(401, "UnauthorizedError", message, { code: "UNAUTHORIZED", ...options });
  }
}

/** 403 — authenticated, but the policy says no (this is what used to come back as 500). */
export class ForbiddenError extends DomainError {
  constructor(message = "Acesso negado", options: DomainErrorOptions = {}) {
    super(403, "ForbiddenError", message, { code: "FORBIDDEN", ...options });
  }
}

/** 404 — the resource does not exist for this actor. */
export class NotFoundError extends DomainError {
  constructor(message = "Recurso não encontrado", options: DomainErrorOptions = {}) {
    super(404, "NotFoundError", message, { code: "NOT_FOUND", ...options });
  }
}

/** 409 — the operation conflicts with the current state (already completed, already a member). */
export class ConflictError extends DomainError {
  constructor(message = "Conflito de estado", options: DomainErrorOptions = {}) {
    super(409, "ConflictError", message, { code: "CONFLICT", ...options });
  }
}

/** Type guard used by route adapters. */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
