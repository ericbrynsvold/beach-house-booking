import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";

export async function recordAudit(input: {
  actor: string;
  action: string;
  entity: string;
  entityId?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(auditEvents).values({
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
  });
}
