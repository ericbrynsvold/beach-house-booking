import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { resources } from "@/db/schema";
import { requireSiteCookie } from "@/lib/api-auth";

export async function GET() {
  if (!(await requireSiteCookie())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const rows = await db.select().from(resources).orderBy(asc(resources.sortOrder));
  return NextResponse.json(rows);
}
