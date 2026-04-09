import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";
import { requireAdminCookie, requireSiteCookie } from "@/lib/api-auth";

export async function GET() {
  if (!(await requireSiteCookie())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await requireAdminCookie())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.id))
    .limit(500);
  return NextResponse.json(rows);
}
