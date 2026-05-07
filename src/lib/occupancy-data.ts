import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { getDb } from "@/db";
import {
  reservationSlots,
  reservations,
  resources,
  type HalfSlot,
} from "@/db/schema";

export type ResourceRow = InferSelectModel<typeof resources>;

export type OccupancyRow = {
  resourceId: number;
  dateLocal: string;
  slot: HalfSlot;
  reservationId: number;
  guestName: string;
  email: string;
};

/** All half-slots booked in [year-month … next month) plus resource list. */
export async function queryOccupancyForMonth(
  year: number,
  month: number,
): Promise<{ occupancy: OccupancyRow[]; resources: ResourceRow[] }> {
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

  const occupancy: OccupancyRow[] = slots.map((s) => ({
    resourceId: s.resourceId,
    dateLocal: s.dateLocal,
    slot: s.slot,
    reservationId: s.reservationId,
    guestName: s.guestName,
    email: s.email,
  }));

  const resList = await db.select().from(resources).orderBy(asc(resources.sortOrder));

  return { occupancy, resources: resList };
}
