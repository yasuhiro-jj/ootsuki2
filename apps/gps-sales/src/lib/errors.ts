export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error(redact(error instanceof Error ? error.message : "unknown error"));
  return Response.json(
    { error: { code: "internal_error", message: "処理に失敗しました" } },
    { status: 500 },
  );
}

function redact(message: string): string {
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}
