import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reservationSlots, reservations, resources, type HalfSlot } from "@/db/schema";
import { requireSiteCookie } from "@/lib/api-auth";
import { buildVevent, icsCalendarWrapper } from "@/lib/ical";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const feed = url.searchParams.get("feed");
  const feedOk =
    process.env.CALENDAR_FEED_TOKEN &&
    feed === process.env.CALENDAR_FEED_TOKEN;
  if (!feedOk && !(await requireSiteCookie())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resourceIdParam = url.searchParams.get("resourceId");
  const resourceIdFilter =
    resourceIdParam === null ? null : Number(resourceIdParam);

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
    .orderBy(asc(reservations.id));

  const filtered =
    resourceIdFilter === null || !Number.isFinite(resourceIdFilter)
      ? resList
      : resList.filter((r) => r.resourceId === resourceIdFilter);

  const vevents: string[] = [];
  for (const r of filtered) {
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

    const uid = `res-${r.id}@beach-house-booking`;
    const summary = `${r.guestName} — ${r.resourceName}`;
    const description = [
      r.email,
      r.notes ? `Notes: ${r.notes}` : "",
    ]
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
    },
  });
}
