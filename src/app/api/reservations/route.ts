import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  reservationSlots,
  reservations,
  resources,
  type HalfSlot,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requireSiteCookie } from "@/lib/api-auth";
import {
  getBookingBlackoutDateSet,
  getBookingPropertyAddress,
  getMaxStayNights,
  getOwnerNotificationEmail,
  getStayEndExclusiveDateString,
  getStayStartDateString,
} from "@/lib/config";
import { sendBookingConfirmationEmail, sendOwnerReservationNotification } from "@/lib/mail";
import {
  areContiguousHalfDays,
  isSlotBookable,
  nightCountFromGuestHalfSlots,
  type SlotPick,
} from "@/lib/slots";
import { appBaseUrl } from "@/lib/url";
import { signGuestToken } from "@/lib/tokens";

type Body = {
  /** Single bed (legacy); ignored if resourceIds is set. */
  resourceId?: number;
  /** One or more beds for the same stay — one confirmation email for the whole request. */
  resourceIds?: number[];
  guestName: string;
  email: string;
  notes?: string | null;
  slots: { dateLocal: string; slot: HalfSlot }[];
};

function normalizeResourceIds(body: Body): number[] | null {
  if (Array.isArray(body.resourceIds) && body.resourceIds.length > 0) {
    const ids = [
      ...new Set(
        body.resourceIds
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n)),
      ),
    ];
    return ids.length > 0 ? ids : null;
  }
  const single = Number(body.resourceId);
  if (!Number.isFinite(single)) return null;
  return [single];
}

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

export async function POST(request: Request) {
  if (!(await requireSiteCookie())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const resourceIds = normalizeResourceIds(body);
  const slotsIn = body.slots ?? [];
  if (
    !body.guestName?.trim() ||
    !body.email?.trim() ||
    !resourceIds ||
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

  for (const resourceId of resourceIds) {
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
  }

  for (const resourceId of resourceIds) {
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
  }

  const db = getDb();
  const email = body.email.trim().toLowerCase();
  const guestName = body.guestName.trim();
  const notes = body.notes?.trim() || null;

  const createdIds = await db.transaction(async (tx) => {
    const ids: number[] = [];
    for (const resourceId of resourceIds) {
      const [ins] = await tx
        .insert(reservations)
        .values({
          resourceId,
          guestName,
          email,
          notes,
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
      ids.push(rid);
    }
    return ids;
  });

  for (let i = 0; i < createdIds.length; i++) {
    await recordAudit({
      actor: `guest:${email}`,
      action: "create",
      entity: "reservation",
      entityId: createdIds[i]!,
      metadata: { resourceId: resourceIds[i]!, slots: slotsIn },
    });
  }

  const nameRows = await db
    .select({ id: resources.id, name: resources.name })
    .from(resources)
    .where(inArray(resources.id, resourceIds));
  const nameById = new Map(nameRows.map((r) => [r.id, r.name]));
  const resourceNames = resourceIds.map(
    (id) => nameById.get(id) ?? "Your space",
  );

  const jwt = await signGuestToken(email);
  const base = appBaseUrl(request);
  const manageUrl = `${base}/me?token=${encodeURIComponent(jwt)}`;
  const sent = await sendBookingConfirmationEmail({
    to: email,
    guestName,
    resourceNames,
    slots: slotsIn,
    manageUrl,
    propertyAddress: getBookingPropertyAddress(),
  });

  await sendOwnerReservationNotification({
    kind: "new",
    ownerTo: getOwnerNotificationEmail(),
    guestName,
    guestEmail: email,
    reservationSummaries: createdIds.map((rid, i) => ({
      id: rid,
      roomName: resourceNames[i] ?? "Room",
    })),
    slots: slotsIn,
    guestNotes: notes,
    sourceLabel: "Booked via the public calendar.",
  });

  return NextResponse.json({
    ids: createdIds,
    id: createdIds[0],
    magicLinkSent: sent.ok,
    ...(sent.devLink ? { devMagicLink: sent.devLink } : {}),
  });
}
