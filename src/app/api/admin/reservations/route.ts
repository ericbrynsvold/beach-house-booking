import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  reservationSlots,
  reservations,
  reservationsSelectColumns,
  type HalfSlot,
} from "@/db/schema";
import { requireAdminCookie, requireSiteCookie } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import {
  getBookingBlackoutDateSet,
  getMaxStayNights,
  getStayEndExclusiveDateString,
  getStayStartDateString,
} from "@/lib/config";
import {
  areContiguousHalfDays,
  isSlotBookable,
  nightCountFromGuestHalfSlots,
  type SlotPick,
} from "@/lib/slots";

async function assertNoConflicts(
  resourceId: number,
  picks: { dateLocal: string; slot: HalfSlot }[],
  exceptReservationId?: number,
) {
  const db = getDb();
  for (const p of picks) {
    const rows = await db
      .select({ reservationId: reservationSlots.reservationId })
      .from(reservationSlots)
      .where(
        and(
          eq(reservationSlots.resourceId, resourceId),
          eq(reservationSlots.dateLocal, p.dateLocal),
          eq(reservationSlots.slot, p.slot),
        ),
      );
    for (const r of rows) {
      if (r.reservationId === exceptReservationId) continue;
      throw new Error("conflict");
    }
  }
}

export async function GET() {
  if (!(await requireSiteCookie())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await requireAdminCookie())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getDb();
  const resList = await db
    .select(reservationsSelectColumns)
    .from(reservations)
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

type Body = {
  resourceId: number;
  guestName: string;
  email: string;
  notes?: string | null;
  slots: { dateLocal: string; slot: HalfSlot }[];
};

export async function POST(request: Request) {
  if (!(await requireSiteCookie())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await requireAdminCookie())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const resourceId = Number(body.resourceId);
  const slotsIn = body.slots ?? [];
  if (
    !body.guestName?.trim() ||
    !body.email?.trim() ||
    !Number.isFinite(resourceId) ||
    slotsIn.length === 0
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const stayStart = getStayStartDateString();
  const stayEndEx = getStayEndExclusiveDateString();
  const blackout = getBookingBlackoutDateSet();
  const maxNights = getMaxStayNights();
  for (const s of slotsIn) {
    if (!isSlotBookable(s.dateLocal, s.slot, stayStart, stayEndEx, blackout)) {
      return NextResponse.json(
        {
          error: blackout.has(s.dateLocal)
            ? `That time includes blackout dates when the house is not open to bookings (${s.dateLocal}).`
            : `Slot out of stay window: ${s.dateLocal} ${s.slot}`,
        },
        { status: 400 },
      );
    }
  }
  const nights = nightCountFromGuestHalfSlots(slotsIn);
  if (!Number.isInteger(nights)) {
    return NextResponse.json(
      { error: "Stay must use whole nights (incomplete half-day range)." },
      { status: 400 },
    );
  }
  if (nights > maxNights) {
    return NextResponse.json(
      {
        error: `Stays are limited to ${maxNights} nights at first so everyone gets a turn; shorten this stay or split it.`,
      },
      { status: 400 },
    );
  }
  const picks: SlotPick[] = slotsIn.map((s) => ({
    resourceId,
    dateLocal: s.dateLocal,
    slot: s.slot,
  }));
  if (!areContiguousHalfDays(picks)) {
    return NextResponse.json(
      { error: "Slots must be contiguous half-days on one resource" },
      { status: 400 },
    );
  }
  try {
    await assertNoConflicts(resourceId, slotsIn);
  } catch (e) {
    if ((e as Error).message === "conflict") {
      return NextResponse.json(
        { error: "One or more half-days are already booked" },
        { status: 409 },
      );
    }
    throw e;
  }

  const db = getDb();
  const email = body.email.trim().toLowerCase();
  const created = await db.transaction(async (tx) => {
    const [ins] = await tx
      .insert(reservations)
      .values({
        resourceId,
        guestName: body.guestName.trim(),
        email,
        notes: body.notes?.trim() || null,
      })
      .returning({ id: reservations.id });
    const rid = ins!.id;
    await tx.insert(reservationSlots).values(
      slotsIn.map((s) => ({
        reservationId: rid,
        resourceId,
        dateLocal: s.dateLocal,
        slot: s.slot,
      })),
    );
    return rid;
  });

  await recordAudit({
    actor: "admin",
    action: "create",
    entity: "reservation",
    entityId: created,
    metadata: { resourceId, slots: slotsIn },
  });

  return NextResponse.json({ id: created });
}
