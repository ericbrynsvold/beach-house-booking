import type { HalfSlot } from "@/db/schema";

export const SLOT_ORDER: HalfSlot[] = ["am", "pm"];

export function halfSlotIndex(slot: HalfSlot): number {
  return slot === "am" ? 0 : 1;
}

/** Linear order key for sorting half-days on the property timeline. */
export function slotSortKey(dateLocal: string, slot: HalfSlot): number {
  const [y, m, d] = dateLocal.split("-").map(Number);
  return y * 1000000 + m * 10000 + d * 10 + halfSlotIndex(slot);
}

export function nextHalfDay(dateLocal: string, slot: HalfSlot): { date: string; slot: HalfSlot } {
  if (slot === "am") {
    return { date: dateLocal, slot: "pm" };
  }
  const [y, m, d] = dateLocal.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const nd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { date: nd, slot: "am" };
}

/**
 * Bookable half-days for the rental.
 * - Nights stay within [stayStart, lastNight].
 * - Morning of stayEndExclusive (e.g. Aug 1 AM) is allowed for checkout only; no PM that day.
 */
export function isSlotBookable(
  dateLocal: string,
  slot: HalfSlot,
  stayStart: string,
  stayEndExclusive: string,
): boolean {
  if (dateLocal < stayStart) return false;
  if (dateLocal === stayEndExclusive) {
    return slot === "am";
  }
  if (dateLocal > stayEndExclusive) return false;
  return true;
}

/** Last calendar night guests can sleep (night before checkout morning). */
export function getLastNightDate(stayEndExclusive: string): string {
  const [y, m, d] = stayEndExclusive.split("-").map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export type SlotPick = { dateLocal: string; slot: HalfSlot; resourceId: number };

function sortPicks(picks: SlotPick[]): SlotPick[] {
  return [...picks].sort(
    (a, b) =>
      slotSortKey(a.dateLocal, a.slot) - slotSortKey(b.dateLocal, b.slot) ||
      a.resourceId - b.resourceId,
  );
}

/** All picks must share the same resourceId. */
export function areContiguousHalfDays(picks: SlotPick[]): boolean {
  if (picks.length === 0) return false;
  const sorted = sortPicks(picks);
  const rid = sorted[0]!.resourceId;
  if (!sorted.every((p) => p.resourceId === rid)) return false;
  let { date, slot } = { date: sorted[0]!.dateLocal, slot: sorted[0]!.slot };
  for (let i = 1; i < sorted.length; i++) {
    const n = nextHalfDay(date, slot);
    const cur = sorted[i]!;
    if (cur.dateLocal !== n.date || cur.slot !== n.slot) return false;
    date = cur.dateLocal;
    slot = cur.slot;
  }
  return true;
}

export function slotKey(resourceId: number, dateLocal: string, slot: HalfSlot): string {
  return `${resourceId}|${dateLocal}|${slot}`;
}

export function enumerateHalfDaysInclusive(
  start: { dateLocal: string; slot: HalfSlot },
  end: { dateLocal: string; slot: HalfSlot },
): { dateLocal: string; slot: HalfSlot }[] {
  if (
    slotSortKey(start.dateLocal, start.slot) > slotSortKey(end.dateLocal, end.slot)
  ) {
    throw new Error("invalid range");
  }
  const out: { dateLocal: string; slot: HalfSlot }[] = [];
  let date = start.dateLocal;
  let slot: HalfSlot = start.slot;
  for (;;) {
    out.push({ dateLocal: date, slot });
    if (date === end.dateLocal && slot === end.slot) break;
    const n = nextHalfDay(date, slot);
    date = n.date;
    slot = n.slot;
    if (out.length > 128) throw new Error("range too long");
  }
  return out;
}

export function parseSlotKey(key: string): SlotPick | null {
  const parts = key.split("|");
  if (parts.length !== 3) return null;
  const resourceId = Number(parts[0]);
  const dateLocal = parts[1]!;
  const slot = parts[2] as HalfSlot;
  if (slot !== "am" && slot !== "pm") return null;
  if (!Number.isFinite(resourceId)) return null;
  return { resourceId, dateLocal, slot };
}
