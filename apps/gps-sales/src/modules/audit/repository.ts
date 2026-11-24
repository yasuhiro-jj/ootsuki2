import type { Db } from "@/db/client";
import { auditLogs } from "@/db/schema";

export async function writeAudit(
  db: Db,
  input: {
    organizationId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    details: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    detailsJson: input.details,
  });
}
