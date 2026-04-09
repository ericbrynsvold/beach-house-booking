import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservationSlots, reservations, resources, type HalfSlot } from "@/db/schema";
import { buildVevent, icsCalendarWrapper } from "@/lib/ical";
import { verifyGuestToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const email = token ? await verifyGuestToken(token) : null;
  if (!email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDb();
  const resList = await db
    .select({
      id: reservations.id,
      guestName: reservations.guestName,
      email: reservations.email,
      notes: reservations.notes,
      resourceId: reservations.resourceId,
      resourceName: resources.name,
    })
    .from(reservations)
    .innerJoin(resources, eq(reservations.resourceId, resources.id))
    .where(eq(reservations.email, email))
    .orderBy(asc(reservations.id));

  const vevents: string[] = [];
  for (const r of resList) {
    const slots = await db
      .select({
        dateLocal: reservationSlots.dateLocal,
        slot: reservationSlots.slot,
      })
      .from(reservationSlots)
      .where(eq(reservationSlots.reservationId, r.id))
      .orderBy(asc(reservationSlots.dateLocal), asc(reservationSlots.slot));

    const dateStarts = slots.map((s) => ({
      dateLocal: s.dateLocal,
      slot: s.slot as HalfSlot,
    }));
    if (dateStarts.length === 0) continue;

    const uid = `res-${r.id}-me@beach-house-booking`;
    const summary = `${r.guestName} — ${r.resourceName}`;
    const description = [r.email, r.notes ? `Notes: ${r.notes}` : ""]
      .filter(Boolean)
      .join("\\n");

    vevents.push(
      buildVevent({
        uid,
        summary,
        description: description || undefined,
        dateStarts,
      }),
    );
  }

  const body = icsCalendarWrapper(vevents);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="my-beach-stay.ics"',
    },
  });
}
