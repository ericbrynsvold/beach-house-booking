import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  reservationSlots,
  reservations,
  type HalfSlot,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requireSiteCookie } from "@/lib/api-auth";
import {
  getStayEndExclusiveDateString,
  getStayStartDateString,
} from "@/lib/config";
import { sendGuestMagicLink } from "@/lib/mail";
import {
  areContiguousHalfDays,
  isSlotBookable,
  type SlotPick,
} from "@/lib/slots";
import { appBaseUrl } from "@/lib/url";
import { signGuestToken } from "@/lib/tokens";

type Body = {
  resourceId: number;
  guestName: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  slots: { dateLocal: string; slot: HalfSlot }[];
};

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
  for (const s of slotsIn) {
    if (!isSlotBookable(s.dateLocal, s.slot, stayStart, stayEndEx)) {
      return NextResponse.json(
        { error: `Slot out of stay window: ${s.dateLocal} ${s.slot}` },
        { status: 400 },
      );
    }
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
        phone: body.phone?.trim() || null,
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
    actor: `guest:${email}`,
    action: "create",
    entity: "reservation",
    entityId: created,
    metadata: { resourceId, slots: slotsIn },
  });

  const jwt = await signGuestToken(email);
  const base = appBaseUrl(request);
  const manageUrl = `${base}/me?token=${encodeURIComponent(jwt)}`;
  const sent = await sendGuestMagicLink({ to: email, manageUrl });

  return NextResponse.json({
    id: created,
    magicLinkSent: sent.ok,
    ...(sent.devLink ? { devMagicLink: sent.devLink } : {}),
  });
}
