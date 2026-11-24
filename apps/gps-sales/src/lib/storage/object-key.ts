import { AppError } from "../errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function visitPhotoObjectKey(
  organizationId: string,
  visitId: string,
  photoId: string,
): string {
  for (const value of [organizationId, visitId, photoId]) {
    if (!UUID_RE.test(value)) {
      throw new AppError(400, "validation_error", "写真キーを組み立てられません");
    }
  }
  return `org/${organizationId}/visits/${visitId}/${photoId}`;
}

export function assertObjectKeyInOrg(objectKey: string, organizationId: string): void {
  const prefix = `org/${organizationId}/`;
  if (!objectKey.startsWith(prefix) || objectKey.includes("..")) {
    throw new AppError(403, "forbidden", "このファイルにはアクセスできません");
  }
}
