import { and, asc, eq, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  reservationSlots,
  reservations,
  resources,
  type HalfSlot,
} from "@/db/schema";
import { requireSiteCookie } from "@/lib/api-auth";

export async function GET(request: Request) {
  if (!(await requireSiteCookie())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const year = Number(searchParams.get("year"));
  if (!month || !year || month < 1 || month > 12) {
    return NextResponse.json({ error: "month and year required" }, { status: 400 });
  }
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const db = getDb();
  const slots = await db
    .select({
      resourceId: reservationSlots.resourceId,
      dateLocal: reservationSlots.dateLocal,
      slot: reservationSlots.slot,
      reservationId: reservationSlots.reservationId,
      guestName: reservations.guestName,
      email: reservations.email,
    })
    .from(reservationSlots)
    .innerJoin(reservations, eq(reservationSlots.reservationId, reservations.id))
    .where(
      and(
        gte(reservationSlots.dateLocal, start),
        lt(reservationSlots.dateLocal, endExclusive),
      ),
    )
    .orderBy(
      asc(reservationSlots.dateLocal),
      asc(reservationSlots.slot),
      asc(reservationSlots.resourceId),
    );

  type Occ = {
    resourceId: number;
    dateLocal: string;
    slot: HalfSlot;
    reservationId: number;
    guestName: string;
    email: string;
  };

  const occupancy: Occ[] = slots.map((s) => ({
    resourceId: s.resourceId,
    dateLocal: s.dateLocal,
    slot: s.slot,
    reservationId: s.reservationId,
    guestName: s.guestName,
    email: s.email,
  }));

  const resList = await db.select().from(resources).orderBy(asc(resources.sortOrder));

  return NextResponse.json({ occupancy, resources: resList });
}
