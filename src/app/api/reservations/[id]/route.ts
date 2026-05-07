import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  reservationSlots,
  reservations,
  reservationsSelectColumns,
  resources,
  type HalfSlot,
} from "@/db/schema";
import {
  getGuestEmailFromRequest,
  requireAdminCookie,
} from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import {
  getBookingBlackoutDateSet,
  getBookingPropertyAddress,
  getMaxStayNights,
  getStayEndExclusiveDateString,
  getStayStartDateString,
} from "@/lib/config";
import { sendStayUpdateConfirmationEmail } from "@/lib/mail";
import { appBaseUrl } from "@/lib/url";
import { signGuestToken } from "@/lib/tokens";
import {
  areContiguousHalfDays,
  isSlotBookable,
  nightCountFromGuestHalfSlots,
  type SlotPick,
} from "@/lib/slots";

async function requireAdminOrGuestBearer(request: Request): Promise<boolean> {
  if (await requireAdminCookie()) return true;
  return (await getGuestEmailFromRequest(request)) !== null;
}

async function assertNoConflicts(
  resourceId: number,
  picks: { dateLocal: string; slot: HalfSlot }[],
  exceptReservationId: number,
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

async function canMutate(
  reservationId: number,
  request: Request,
): Promise<"admin" | "guest" | null> {
  if (await requireAdminCookie()) {
    return "admin";
  }
  const email = await getGuestEmailFromRequest(request);
  if (!email) return null;
  const db = getDb();
  const [row] = await db
    .select({ email: reservations.email })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (row?.email.toLowerCase() === email) return "guest";
  return null;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminOrGuestBearer(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const role = await canMutate(id, request);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    guestName?: string;
    email?: string;
    notes?: string | null;
    resourceId?: number;
    slots?: { dateLocal: string; slot: HalfSlot }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select(reservationsSelectColumns)
    .from(reservations)
    .where(eq(reservations.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resourceId =
    body.resourceId !== undefined ? Number(body.resourceId) : existing.resourceId;
  const slotsIn = body.slots;

  if (slotsIn !== undefined) {
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
    if (role !== "admin" && nights > maxNights) {
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
      await assertNoConflicts(resourceId, slotsIn, id);
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

  const guestName =
    body.guestName !== undefined ? body.guestName.trim() : existing.guestName;
  const email =
    body.email !== undefined
      ? body.email.trim().toLowerCase()
      : existing.email;
  const notes =
    body.notes !== undefined ? body.notes?.trim() || null : existing.notes;

  if (role === "guest" && (body.email !== undefined || body.resourceId !== undefined)) {
    return NextResponse.json(
      { error: "Guests cannot change email or resource" },
      { status: 403 },
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(reservations)
      .set({
        resourceId,
        guestName,
        email,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, id));

    if (slotsIn !== undefined) {
      await tx.delete(reservationSlots).where(eq(reservationSlots.reservationId, id));
      await tx.insert(reservationSlots).values(
        slotsIn.map((s) => ({
          reservationId: id,
          resourceId,
          dateLocal: s.dateLocal,
          slot: s.slot,
        })),
      );
    }
  });

  await recordAudit({
    actor: role === "admin" ? "admin" : `guest:${existing.email}`,
    action: "update",
    entity: "reservation",
    entityId: id,
    metadata: { fields: Object.keys(body) },
  });

  const slots = await db
    .select()
    .from(reservationSlots)
    .where(eq(reservationSlots.reservationId, id))
    .orderBy(asc(reservationSlots.dateLocal), asc(reservationSlots.slot));

  let confirmationEmailSent: boolean | undefined;
  let devMagicLink: string | undefined;

  if (slotsIn !== undefined) {
    const [resRow] = await db
      .select({ name: resources.name })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);
    const slotsPayload = slots.map((s) => ({
      dateLocal: s.dateLocal,
      slot: s.slot,
    }));
    const jwt = await signGuestToken(email);
    const base = appBaseUrl(request);
    const manageUrl = `${base}/me?token=${encodeURIComponent(jwt)}`;
    const sent = await sendStayUpdateConfirmationEmail({
      to: email,
      guestName,
      resourceNames: [resRow?.name ?? "Your space"],
      slots: slotsPayload,
      manageUrl,
      propertyAddress: getBookingPropertyAddress(),
    });
    confirmationEmailSent = sent.ok;
    if (sent.devLink) devMagicLink = sent.devLink;
  }

  return NextResponse.json({
    ...existing,
    resourceId,
    guestName,
    email,
    notes,
    slots,
    ...(slotsIn !== undefined
      ? {
          confirmationEmailSent,
          ...(devMagicLink ? { devMagicLink } : {}),
        }
      : {}),
  });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminOrGuestBearer(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const role = await canMutate(id, request);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const [existing] = await db
    .select(reservationsSelectColumns)
    .from(reservations)
    .where(eq(reservations.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(reservations).where(eq(reservations.id, id));

  await recordAudit({
    actor: role === "admin" ? "admin" : `guest:${existing.email}`,
    action: "delete",
    entity: "reservation",
    entityId: id,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
