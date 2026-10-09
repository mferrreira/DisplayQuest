/**
 * domainErrorResponse — R4 route mapping of typed business errors (AC-00-07, SPEC §1.5).
 *
 * A use case throws a `DomainError` carrying its own stable status/code; the route maps it
 * instead of inventing a 500. The body shape `{ error, code, details }` is a superset of the
 * existing `{ error }` convention (createApiError), so current clients keep working.
 *
 * Returns `null` when the error is NOT a DomainError — the caller keeps its generic 500 path
 * (unknown errors stay unknown; the mapper never swallows them).
 */
import { NextResponse } from "next/server";
import { isDomainError } from "@/backend/domain";

export function domainErrorResponse(error: unknown): NextResponse | null {
  if (!isDomainError(error)) {
    return null;
  }
  return NextResponse.json(error.toJSON(), { status: error.status });
}
