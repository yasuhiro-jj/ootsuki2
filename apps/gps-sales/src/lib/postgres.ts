export function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresCode(error.cause);
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505";
}

export function isForeignKeyViolation(error: unknown): boolean {
  return postgresCode(error) === "23503";
}
