import { z } from "zod";

const stayEnv = z.object({
  STAY_YEAR: z.coerce.number().default(2026),
  STAY_MONTH_START: z.coerce.number().default(7),
  STAY_DAY_START: z.coerce.number().default(3),
  STAY_MONTH_END_EXCLUSIVE: z.coerce.number().default(8),
  STAY_DAY_END_EXCLUSIVE: z.coerce.number().default(1),
  TIMEZONE: z.string().default("America/Chicago"),
});

function getStayConfig() {
  return stayEnv.parse({
    STAY_YEAR: process.env.STAY_YEAR,
    STAY_MONTH_START: process.env.STAY_MONTH_START,
    STAY_DAY_START: process.env.STAY_DAY_START,
    STAY_MONTH_END_EXCLUSIVE: process.env.STAY_MONTH_END_EXCLUSIVE,
    STAY_DAY_END_EXCLUSIVE: process.env.STAY_DAY_END_EXCLUSIVE,
    TIMEZONE: process.env.TIMEZONE,
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
