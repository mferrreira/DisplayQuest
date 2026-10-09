// @vitest-environment node
/**
 * ONDA 0 / batch 0.2 — DC1: `backend/domain/errors` is pure and carries a stable status+code.
 *
 * The statuses are the contract the route adapters will map (AC-00-07). If one of these
 * numbers changes, every client that branches on it changes with it — that is the point of
 * asserting them here instead of in a route test.
 */
import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  isDomainError,
} from "@/backend/domain/errors";

describe("DomainError", () => {
  it("gives every business condition a stable HTTP status", () => {
    expect(new ValidationError("x").status).toBe(400);
    expect(new UnauthorizedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ConflictError().status).toBe(409);
  });

  it("gives every business condition a stable machine code", () => {
    expect(new ValidationError("x").code).toBe("VALIDATION_ERROR");
    expect(new UnauthorizedError().code).toBe("UNAUTHORIZED");
    expect(new ForbiddenError().code).toBe("FORBIDDEN");
    expect(new NotFoundError().code).toBe("NOT_FOUND");
    expect(new ConflictError().code).toBe("CONFLICT");
  });

  it("is an Error subclass, so existing catch blocks keep working", () => {
    const error = new ForbiddenError("Apenas coordenadores podem aprovar");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toBe("Apenas coordenadores podem aprovar");
  });

  it("does not leak a generic Error as a business condition", () => {
    expect(isDomainError(new Error("boom"))).toBe(false);
    expect(isDomainError(null)).toBe(false);
    expect(isDomainError("nope")).toBe(false);
    expect(isDomainError(new NotFoundError())).toBe(true);
  });

  it("serialises to the transport shape a route adapter maps", () => {
    const error = new NotFoundError("Tarefa não encontrada", { details: { taskId: 7 } });
    expect(error.toJSON()).toEqual({
      error: "Tarefa não encontrada",
      code: "NOT_FOUND",
      details: { taskId: 7 },
    });
  });

  it("keeps a name that survives minification (explicit, not new.target.name)", () => {
    expect(new ConflictError().name).toBe("ConflictError");
    expect(new ValidationError("Pontos não podem ser negativos").name).toBe("ValidationError");
  });

  it("carries an optional cause without changing the status contract", () => {
    const cause = new Error("driver said no");
    const error = new ConflictError("Sessão já finalizada", { cause });
    expect(error.cause).toBe(cause);
    expect(error.status).toBe(409);
  });
});
