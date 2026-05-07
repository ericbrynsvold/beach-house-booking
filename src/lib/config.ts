import { z } from "zod";
import { TRIP_PROPERTY_ADDRESS } from "@/lib/property-info";

const stayEnv = z.object({
  STAY_YEAR: z.coerce.number().default(2026),
  STAY_MONTH_START: z.coerce.number().default(7),
  STAY_DAY_START: z.coerce.number().default(3),
  STAY_MONTH_END_EXCLUSIVE: z.coerce.number().default(8),
  STAY_DAY_END_EXCLUSIVE: z.coerce.number().default(1),
  TIMEZONE: z.string().default("America/Chicago"),
  /** Max consecutive nights per reservation (initial rollout). */
  MAX_STAY_NIGHTS: z.coerce.number().int().positive().default(7),
  /** Inclusive blackout range on the calendar (local stay year). No guest or admin bookings on these dates. */
  BLACKOUT_MONTH: z.coerce.number().int().min(1).max(12).default(7),
  BLACKOUT_DAY_START: z.coerce.number().int().min(1).max(31).default(3),
  BLACKOUT_DAY_END: z.coerce.number().int().min(1).max(31).default(5),
});

function getStayConfig() {
  return stayEnv.parse({
    STAY_YEAR: process.env.STAY_YEAR,
    STAY_MONTH_START: process.env.STAY_MONTH_START,
    STAY_DAY_START: process.env.STAY_DAY_START,
    STAY_MONTH_END_EXCLUSIVE: process.env.STAY_MONTH_END_EXCLUSIVE,
    STAY_DAY_END_EXCLUSIVE: process.env.STAY_DAY_END_EXCLUSIVE,
    TIMEZONE: process.env.TIMEZONE,
    MAX_STAY_NIGHTS: process.env.MAX_STAY_NIGHTS,
    BLACKOUT_MONTH: process.env.BLACKOUT_MONTH,
    BLACKOUT_DAY_START: process.env.BLACKOUT_DAY_START,
    BLACKOUT_DAY_END: process.env.BLACKOUT_DAY_END,
  });
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First bookable calendar day at the property (YYYY-MM-DD, CDT). */
export function getStayStartDateString(): string {
  const c = getStayConfig();
  return ymd(c.STAY_YEAR, c.STAY_MONTH_START, c.STAY_DAY_START);
}

/** First day after the stay window — not bookable (YYYY-MM-DD). */
export function getStayEndExclusiveDateString(): string {
  const c = getStayConfig();
  return ymd(c.STAY_YEAR, c.STAY_MONTH_END_EXCLUSIVE, c.STAY_DAY_END_EXCLUSIVE);
}

export function getTimezone(): string {
  return getStayConfig().TIMEZONE;
}

export function getStayYear(): number {
  return getStayConfig().STAY_YEAR;
}

export function getMaxStayNights(): number {
  return getStayConfig().MAX_STAY_NIGHTS;
}

/** YYYY-MM-DD dates (stay-year local) that cannot be booked at all. */
export function getBookingBlackoutDateStrings(): string[] {
  const c = getStayConfig();
  const y = c.STAY_YEAR;
  const m = c.BLACKOUT_MONTH;
  const out: string[] = [];
  for (let d = c.BLACKOUT_DAY_START; d <= c.BLACKOUT_DAY_END; d++) {
    out.push(ymd(y, m, d));
  }
  return out;
}

export function getBookingBlackoutDateSet(): ReadonlySet<string> {
  return new Set(getBookingBlackoutDateStrings());
}

/** Street address for booking emails — env overrides built-in Trip info copy. */
export function getBookingPropertyAddress(): string {
  const fromEnv = (process.env.BOOKING_PROPERTY_ADDRESS ?? "").trim();
  return fromEnv || TRIP_PROPERTY_ADDRESS;
}
