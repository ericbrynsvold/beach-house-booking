import type { HalfSlot } from "@/db/schema";
import { fromZonedTime } from "date-fns-tz";
import { getTimezone } from "@/lib/config";
import { slotSortKey } from "@/lib/slots";

const tzBlock = () => getTimezone();

/** AM = [day 00:00, day 12:00), PM = [day 12:00, next day 00:00) in local wall time. */
export function slotToLocalRange(
  dateLocal: string,
  slot: HalfSlot,
): { start: Date; end: Date } {
  const tz = tzBlock();
  if (slot === "am") {
    const start = fromZonedTime(`${dateLocal} 00:00:00`, tz);
    const end = fromZonedTime(`${dateLocal} 12:00:00`, tz);
    return { start, end };
  }
  const start = fromZonedTime(`${dateLocal} 12:00:00`, tz);
  const [y, m, d] = dateLocal.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  const end = fromZonedTime(`${nextStr} 00:00:00`, tz);
  return { start, end };
}

function formatIcsLocal(d: Date): string {
  const tz = tzBlock();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  const y = parts.year ?? "";
  const mo = parts.month ?? "";
  const da = parts.day ?? "";
  const h = parts.hour ?? "";
  const mi = parts.minute ?? "";
  const s = parts.second ?? "";
  return `${y}${mo}${da}T${h}${mi}${s}`;
}

function formatUtcCompact(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${mi}${s}Z`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildVevent(params: {
  uid: string;
  summary: string;
  description?: string;
  dateStarts: { dateLocal: string; slot: HalfSlot }[];
}): string {
  const zone = tzBlock();
  const sorted = [...params.dateStarts].sort(
    (a, b) => slotSortKey(a.dateLocal, a.slot) - slotSortKey(b.dateLocal, b.slot),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const startR = slotToLocalRange(first.dateLocal, first.slot);
  const endR = slotToLocalRange(last.dateLocal, last.slot);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${formatUtcCompact(new Date())}`,
    `SUMMARY:${escapeText(params.summary)}`,
    `DTSTART;TZID=${zone}:${formatIcsLocal(startR.start)}`,
    `DTEND;TZID=${zone}:${formatIcsLocal(endR.end)}`,
  ];
  if (params.description) {
    lines.push(`DESCRIPTION:${escapeText(params.description)}`);
  }
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export function icsCalendarWrapper(vevents: string[]): string {
  const zone = tzBlock();
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Beach House Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${zone}`,
    "BEGIN:VTIMEZONE",
    `TZID:${zone}`,
    "END:VTIMEZONE",
  ].join("\r\n");
  const footer = "END:VCALENDAR";
  return `${header}\r\n${vevents.join("\r\n")}\r\n${footer}`;
}

export function googleCalendarUrl(params: {
  title: string;
  details?: string;
  start: Date;
  end: Date;
}): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", params.title);
  u.searchParams.set("dates", `${fmt(params.start)}/${fmt(params.end)}`);
  if (params.details) u.searchParams.set("details", params.details);
  return u.toString();
}

export function slotsToUtcRange(
  slots: { dateLocal: string; slot: HalfSlot }[],
): { start: Date; end: Date } | null {
  if (slots.length === 0) return null;
  const sorted = [...slots].sort(
    (a, b) => slotSortKey(a.dateLocal, a.slot) - slotSortKey(b.dateLocal, b.slot),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const start = slotToLocalRange(first.dateLocal, first.slot).start;
  const end = slotToLocalRange(last.dateLocal, last.slot).end;
  return { start, end };
}
