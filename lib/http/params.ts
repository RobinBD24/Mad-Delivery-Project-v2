import { sk, validationError } from "@/lib/http/errors";

/**
 * Parse a path/query id. A missing or non-numeric id is a CLIENT error, so it
 * becomes a 400 with a translated message. Without this, `Number("abc")` is NaN
 * and Prisma rejects the query with a 500, which tells the caller nothing and
 * looks like a server fault in the logs.
 */
export function parseId(raw: string | null | undefined, field = "id"): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw validationError({ [field]: sk("errors.ops.idRequired") });
  }
  return value;
}
