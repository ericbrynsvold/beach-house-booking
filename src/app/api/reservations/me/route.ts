import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { reservationSlots, reservations, resources } from "@/db/schema";
import { getGuestEmailFromRequest } from "@/lib/api-auth";

export async function GET(request: Request) {
  const email = await getGuestEmailFromRequest(request);
  if (!email) {
    return NextResponse.json({ error: "Guest token required" }, { status: 401 });
  }
  const db = getDb();
  const resList = await db
    .select({
      id: reservations.id,
      resourceId: reservations.resourceId,
      guestName: reservations.guestName,
      email: reservations.email,
      phone: reservations.phone,
      notes: reservations.notes,
      createdAt: reservations.createdAt,
      updatedAt: reservations.updatedAt,
      resourceName: resources.name,
      resourceSortOrder: resources.sortOrder,
    })
    .from(reservations)
    .innerJoin(resources, eq(reservations.resourceId, resources.id))
    .where(eq(reservations.email, email))
    .orderBy(asc(reservations.id));

  const out = [];
  for (const r of resList) {
    const slots = await db
      .select()
      .from(reservationSlots)
      .where(eq(reservationSlots.reservationId, r.id))
      .orderBy(asc(reservationSlots.dateLocal), asc(reservationSlots.slot));
    out.push({ ...r, slots });
  }
  return NextResponse.json(out);
}
