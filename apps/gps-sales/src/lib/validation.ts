import type { ZodType } from "zod";
import { AppError } from "./errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, code = "not_found"): string {
  if (!UUID_RE.test(value)) {
    throw new AppError(404, code, "対象が見つかりません");
  }
  return value;
}

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter((field) => field.length > 0);
    const suffix = fields.length > 0 ? `: ${fields.join(", ")}` : "";
    throw new AppError(400, "validation_error", `入力内容を確認してください${suffix}`);
  }
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > 100_000) {
    throw new AppError(413, "payload_too_large", "リクエストが大きすぎます");
  }
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "invalid_json", "JSONを解釈できません");
  }
}
