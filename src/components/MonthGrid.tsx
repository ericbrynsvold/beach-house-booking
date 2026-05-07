"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HalfSlot } from "@/db/schema";
import {
  enumerateHalfDaysInclusive,
  getLastNightDate,
  isSlotBookable,
  nightCountFromGuestHalfSlots,
  slotKey,
} from "@/lib/slots";

type ResourceRow = { id: number; name: string; sortOrder: number };

type Occ = {
  resourceId: number;
  dateLocal: string;
  slot: HalfSlot;
  reservationId: number;
  guestName: string;
  email: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

type GridCell = null | {
  month: number;
  day: number;
  dateLocal: string;
};

/** First full month of the stay (e.g. July) through checkout morning (e.g. Aug 1) in one grid. */
function extendedBookingWeeks(
  tripYear: number,
  startMonth: number,
  stayEndExclusive: string,
): GridCell[][] {
  const [ey, em, ed] = stayEndExclusive.split("-").map(Number);
  const first = new Date(tripYear, startMonth - 1, 1);
  const startDow = first.getDay();
  const dim = new Date(tripYear, startMonth, 0).getDate();
  const cells: GridCell[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) {
    cells.push({
      month: startMonth,
      day: d,
      dateLocal: `${tripYear}-${pad2(startMonth)}-${pad2(d)}`,
    });
  }

  const primaryLast = new Date(tripYear, startMonth - 1, dim);
  const checkoutEnd = new Date(ey, em - 1, ed);
  const iter = new Date(primaryLast);
  iter.setDate(iter.getDate() + 1);
  while (iter.getTime() <= checkoutEnd.getTime()) {
    const y = iter.getFullYear();
    const mo = iter.getMonth() + 1;
    const d = iter.getDate();
    cells.push({
      month: mo,
      day: d,
      dateLocal: `${y}-${pad2(mo)}-${pad2(d)}`,
    });
    iter.setDate(iter.getDate() + 1);
  }

  while (cells.length % 7 !== 0) cells.push(null);

  const rows: GridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

type CellKind = "muted" | "checkoutMorning" | "full";

function cellKind(
  dateLocal: string,
  stayStart: string,
  stayEndExclusive: string,
  lastNight: string,
  blackoutDays: ReadonlySet<string>,
): CellKind {
  if (blackoutDays.has(dateLocal)) return "muted";
  if (dateLocal < stayStart || dateLocal > stayEndExclusive) return "muted";
  if (dateLocal === stayEndExclusive) return "checkoutMorning";
  if (dateLocal >= stayStart && dateLocal <= lastNight) return "full";
  return "muted";
}

function dayAllResourcesFull(
  dateLocal: string,
  resList: ResourceRow[],
  occ: Map<string, Occ>,
): boolean {
  if (resList.length === 0) return false;
  return resList.every(
    (res) =>
      occ.has(slotKey(res.id, dateLocal, "am")) &&
      occ.has(slotKey(res.id, dateLocal, "pm")),
  );
}

function firstName(guestName: string): string {
  const t = guestName.trim();
  if (!t) return "?";
  return t.split(/\s+/)[0] ?? t;
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function resourceLabel(res: ResourceRow): string {
  if (res.sortOrder === 0) return "Queen room";
  if (res.sortOrder === 1) return "Sofa bed";
  return res.name.replace("Guest ", "").replace(" (", " — ").replace(")", "");
}

/** One name for full-day same guest; a.m./p.m. only for single-slot days or turnover. */
type ResourceDaySlots =
  | { kind: "open" }
  | { kind: "name"; text: string }
  | { kind: "half"; half: "am" | "pm"; name: string }
  | { kind: "turnover"; am: string; pm: string };

function resourceDayOccupancy(
  occAm: Occ | undefined,
  occPm: Occ | undefined,
): ResourceDaySlots {
  if (!occAm && !occPm) return { kind: "open" };
  if (occAm && occPm) {
    if (occAm.reservationId === occPm.reservationId) {
      return { kind: "name", text: firstName(occAm.guestName) };
    }
    return {
      kind: "turnover",
      am: firstName(occAm.guestName),
      pm: firstName(occPm.guestName),
    };
  }
  if (occAm) {
    return { kind: "half", half: "am", name: firstName(occAm.guestName) };
  }
  return { kind: "half", half: "pm", name: firstName(occPm!.guestName) };
}

function OccupancyBody({ display }: { display: ResourceDaySlots }) {
  if (display.kind === "open") {
    return (
      <span className="block text-[9px] opacity-60">open</span>
    );
  }
  if (display.kind === "name") {
    return <span className="block opacity-95">{display.text}</span>;
  }
  if (display.kind === "half") {
    const tag = display.half === "am" ? "a.m." : "p.m.";
    return (
      <span className="block opacity-95">
        {display.name} · {tag}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5 leading-tight opacity-95">
      <span>{display.am} · a.m.</span>
      <span>{display.pm} · p.m.</span>
    </span>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function MonthGrid(props: {
  stayStart: string;
  stayEndExclusive: string;
  blackoutDates: string[];
  maxStayNights: number;
  onBooked: () => void;
}) {
  const { stayStart, stayEndExclusive, blackoutDates, maxStayNights, onBooked } =
    props;

  const blackoutSet = useMemo(
    () => new Set(blackoutDates) as ReadonlySet<string>,
    [blackoutDates],
  );

  const blackoutRangeLabel = useMemo(() => {
    if (blackoutDates.length === 0) return "the blackout period";
    const sorted = [...blackoutDates].sort();
    const a = sorted[0]!;
    const b = sorted[sorted.length - 1]!;
    if (a === b) return formatDayLabel(a);
    return `${formatDayLabel(a)}–${formatDayLabel(b)}`;
  }, [blackoutDates]);

  const tripYear = Number(stayStart.slice(0, 4));
  const startMonth = Number(stayStart.slice(5, 7));
  const checkoutMonth = Number(stayEndExclusive.slice(5, 7));

  const gridTitle = useMemo(() => {
    const long = (mo: number) =>
      new Date(tripYear, mo - 1, 1).toLocaleString(undefined, {
        month: "long",
      });
    const short = (mo: number) =>
      new Date(tripYear, mo - 1, 1).toLocaleString(undefined, {
        month: "short",
      });
    if (startMonth === checkoutMonth) {
      return `${long(startMonth)} ${tripYear}`;
    }
    return `${long(startMonth)}–${short(checkoutMonth)} ${tripYear}`;
  }, [tripYear, startMonth, checkoutMonth]);

  const bookingWeeks = useMemo(
    () => extendedBookingWeeks(tripYear, startMonth, stayEndExclusive),
    [tripYear, startMonth, stayEndExclusive],
  );

  const monthsToShow = useMemo(() => {
    const m: number[] = [];
    for (let mo = startMonth; mo <= checkoutMonth; mo++) m.push(mo);
    return m;
  }, [startMonth, checkoutMonth]);

  const lastNight = useMemo(
    () => getLastNightDate(stayEndExclusive),
    [stayEndExclusive],
  );

  const [occupancy, setOccupancy] = useState<Occ[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [bookQueen, setBookQueen] = useState(true);
  const [bookSofa, setBookSofa] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);

  const occMap = useMemo(() => {
    const m = new Map<string, Occ>();
    for (const o of occupancy) {
      m.set(slotKey(o.resourceId, o.dateLocal, o.slot), o);
    }
    return m;
  }, [occupancy]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const fetches = monthsToShow.map((month) =>
        fetch(`/api/occupancy?year=${tripYear}&month=${month}`, {
          credentials: "include",
        }),
      );
      const responses = await Promise.all(fetches);
      const occ: Occ[] = [];
      let resList: ResourceRow[] = [];
      for (const r of responses) {
        const text = await r.text();
        if (!r.ok) {
          let detail = text;
          try {
            const parsed = JSON.parse(text) as { error?: string };
            if (parsed.error) detail = parsed.error;
          } catch {
            /* ignore */
          }
          if (r.status === 401) throw new Error(`UNAUTHORIZED:${detail}`);
          throw new Error(detail);
        }
        const j = JSON.parse(text) as {
          occupancy: Occ[];
          resources: ResourceRow[];
        };
        occ.push(...j.occupancy);
        if (resList.length === 0) resList = j.resources;
      }
      setOccupancy(occ);
      setResources(resList);
    } catch (e) {
      const raw = (e as Error).message;
      if (raw.startsWith("UNAUTHORIZED:")) {
        setErr(
          "We couldn’t load the calendar. Open the unlock page, enter the family passphrase again, and keep using the same site address you used before (for example, always “localhost” or always “127.0.0.1”).",
        );
      } else {
        setErr(raw);
      }
    } finally {
      setLoading(false);
    }
  }, [monthsToShow, tripYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const plannedSlots = useMemo(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) return [];
    try {
      return enumerateHalfDaysInclusive(
        { dateLocal: checkIn, slot: "pm" },
        { dateLocal: checkOut, slot: "am" },
      );
    } catch {
      return [];
    }
  }, [checkIn, checkOut]);

  useEffect(() => {
    if (plannedSlots.length === 0) {
      setPlanErr(null);
      return;
    }
    const hitsBlackout = plannedSlots.some((s) => blackoutSet.has(s.dateLocal));
    if (hitsBlackout) {
      setPlanErr(
        `Those dates overlap our arrival blackout (${blackoutRangeLabel})—the house isn’t open to bookings then. Pick a range that avoids those days.`,
      );
      return;
    }
    const badWindow = plannedSlots.some(
      (s) => !isSlotBookable(s.dateLocal, s.slot, stayStart, stayEndExclusive),
    );
    if (badWindow) {
      setPlanErr(
        "Those dates don’t work with the last morning we have the house—try a different leave day.",
      );
      return;
    }
    const nights = nightCountFromGuestHalfSlots(plannedSlots);
    if (nights > maxStayNights) {
      setPlanErr(
        `That stay is ${nights} nights—longer than the ${maxStayNights}-night limit for now. Shorten it for this first round; we plan to allow longer stays once everyone has had a chance to book.`,
      );
      return;
    }
    setPlanErr(null);
  }, [
    plannedSlots,
    stayStart,
    stayEndExclusive,
    blackoutSet,
    blackoutRangeLabel,
    maxStayNights,
  ]);

  /** Primary = sort 0 if present, else lowest sort_order; secondary = sort 1 if it’s a different row, else any other resource. */
  const { queenRes, sofaRes, hasSofaBed } = useMemo(() => {
    const sorted = [...resources].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    );
    const primary =
      sorted.find((r) => r.sortOrder === 0) ?? sorted[0];
    const sort1 = sorted.find((r) => r.sortOrder === 1);
    const secondary =
      sort1 && primary && sort1.id !== primary.id
        ? sort1
        : sorted.find((r) => primary && r.id !== primary.id);
    const hasTwo =
      !!primary && !!secondary && secondary.id !== primary.id;
    return {
      queenRes: primary,
      sofaRes: secondary,
      hasSofaBed: hasTwo,
    };
  }, [resources]);

  function wantResourceIds(): number[] {
    const ids: number[] = [];
    if (bookQueen && queenRes) ids.push(queenRes.id);
    if (bookSofa && sofaRes && hasSofaBed) ids.push(sofaRes.id);
    return ids;
  }

  function pmFreeForArrival(dateLocal: string): boolean {
    const ids = wantResourceIds();
    if (ids.length === 0) return false;
    return ids.every((id) => !occMap.has(slotKey(id, dateLocal, "pm")));
  }

  function planFitsExistingBookings(startDate: string, endDate: string): boolean {
    let slots;
    try {
      slots = enumerateHalfDaysInclusive(
        { dateLocal: startDate, slot: "pm" },
        { dateLocal: endDate, slot: "am" },
      );
    } catch {
      return false;
    }
    const ids = wantResourceIds();
    if (ids.length === 0) return false;
    for (const id of ids) {
      for (const s of slots) {
        if (occMap.has(slotKey(id, s.dateLocal, s.slot))) return false;
      }
    }
    return true;
  }

  function onDayClick(dateLocal: string) {
    setSubmitMsg(null);
    const kind = cellKind(
      dateLocal,
      stayStart,
      stayEndExclusive,
      lastNight,
      blackoutSet,
    );
    if (kind === "muted") return;

    const canArrive = kind === "full";
    const canCheckout =
      dateLocal > (checkIn ?? "") && dateLocal <= stayEndExclusive;

    if (!checkIn || (checkIn && checkOut)) {
      // Checkout-only day is never a first tap.
      if (dateLocal === stayEndExclusive) return;
      if (!canArrive) return;
      setCheckIn(dateLocal);
      setCheckOut(null);
      return;
    }

    if (dateLocal <= checkIn) {
      if (canArrive) {
        setCheckIn(dateLocal);
        setCheckOut(null);
      }
      return;
    }

    if (canCheckout) {
      setCheckOut(dateLocal);
    }
  }

  function dayClickable(dateLocal: string): boolean {
    const kind = cellKind(
      dateLocal,
      stayStart,
      stayEndExclusive,
      lastNight,
      blackoutSet,
    );
    if (kind === "muted") return false;

    const pickingNewRange = !checkIn || !!(checkIn && checkOut);

    if (pickingNewRange) {
      if (dateLocal === stayEndExclusive) return false;
      if (kind !== "full") return false;
      return pmFreeForArrival(dateLocal);
    }

    if (dateLocal <= checkIn) {
      if (kind !== "full") return false;
      return pmFreeForArrival(dateLocal);
    }

    if (dateLocal > stayEndExclusive) return false;
    if (kind !== "full" && kind !== "checkoutMorning") return false;
    return planFitsExistingBookings(checkIn!, dateLocal);
  }

  function resetDateSelection() {
    setCheckIn(null);
    setCheckOut(null);
    setPlanErr(null);
  }

  function clearDates() {
    resetDateSelection();
    setSubmitMsg(null);
  }

  function isDayInSelectedRange(dateLocal: string): boolean {
    if (!checkIn) return false;
    if (checkOut) {
      return dateLocal >= checkIn && dateLocal <= checkOut;
    }
    return dateLocal === checkIn;
  }

  function slotsFreeForResource(resourceId: number): boolean {
    for (const s of plannedSlots) {
      const k = slotKey(resourceId, s.dateLocal, s.slot);
      if (occMap.has(k)) return false;
    }
    return true;
  }

  async function submitBooking() {
    setSubmitMsg(null);
    if (!guestName.trim() || !email.trim()) {
      setSubmitMsg("Please add your name and email.");
      return;
    }
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setSubmitMsg("Tap your arrival night, then tap the morning you’ll leave.");
      return;
    }
    if (plannedSlots.length === 0 || planErr) {
      setSubmitMsg(planErr ?? "Those dates don’t work—try adjusting them.");
      return;
    }
    const want: { id: number; label: string }[] = [];
    if (bookQueen && queenRes) {
      want.push({ id: queenRes.id, label: resourceLabel(queenRes) });
    }
    if (bookSofa && sofaRes && hasSofaBed) {
      want.push({ id: sofaRes.id, label: resourceLabel(sofaRes) });
    }
    if (want.length === 0) {
      setSubmitMsg("Pick at least one spot to sleep: queen room and/or sofa bed.");
      return;
    }
    for (const w of want) {
      if (!slotsFreeForResource(w.id)) {
        setSubmitMsg(
          `Someone is already on the calendar for part of that time in the ${w.label}. Try different dates or the other bed.`,
        );
        return;
      }
    }

    const slotsPayload = plannedSlots.map((s) => ({
      dateLocal: s.dateLocal,
      slot: s.slot,
    }));

    setSubmitting(true);
    try {
      const r = await fetch("/api/reservations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceIds: want.map((w) => w.id),
          guestName: guestName.trim(),
          email: email.trim(),
          notes: notes.trim() || null,
          slots: slotsPayload,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSubmitMsg(j.error ?? r.statusText);
        await load();
        return;
      }
      const results = want.map((w) => w.label);
      const magicLinkSent = !!j.magicLinkSent;
      setSubmitMsg(
        magicLinkSent
          ? `You’re on the calendar for: ${results.join(" · ")}. Check your email for a link to view or change your booking.`
          : `You’re on the calendar for: ${results.join(" · ")}. We couldn’t send a manage link by email—ask the host for help, or check with whoever runs this site.`,
      );
      resetDateSelection();
      setGuestName("");
      setEmail("");
      setNotes("");
      setBookQueen(true);
      setBookSofa(false);
      onBooked();
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {loading && (
        <p className="text-sm font-medium text-teal-700/80">Loading calendar…</p>
      )}

      <p className="text-sm leading-relaxed text-teal-900/85">
        <strong className="text-teal-950">How to book:</strong> tap the{" "}
        <strong>night you arrive</strong>, then tap the{" "}
        <strong>morning you’ll leave</strong>. Then pick the queen
        room, the sofa bed, or both. Names on the calendar show who’s already
        there.
      </p>

      {err && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p>{err}</p>
          {err.includes("unlock") && (
            <p className="mt-2">
              <Link
                className="font-semibold text-rose-950 underline decoration-rose-400"
                href="/unlock?next=/calendar"
              >
                Open unlock page
              </Link>
            </p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border-2 border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white p-3 shadow-md shadow-teal-900/10 sm:p-4">
        <h3 className="mb-2 text-base font-semibold text-teal-950">{gridTitle}</h3>
        <div className="grid grid-cols-7 gap-px bg-amber-100/90 text-xs">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-gradient-to-b from-teal-600 to-teal-700 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-50"
            >
              {d}
            </div>
          ))}
          {bookingWeeks.map((week, wi) =>
            week.map((cell, di) => {
              const key = `grid-${wi}-${di}`;
              if (cell === null) {
                return (
                  <div
                    key={key}
                    className="min-h-[88px] bg-amber-50/30"
                    aria-hidden
                  />
                );
              }
              const { dateLocal, day, month: cellMonth } = cell;
              const kind = cellKind(
                dateLocal,
                stayStart,
                stayEndExclusive,
                lastNight,
                blackoutSet,
              );
              const inRangeVisual = isDayInSelectedRange(dateLocal);
              const clickable = dayClickable(dateLocal);
              const houseFull =
                kind !== "muted" &&
                dayAllResourcesFull(dateLocal, resources, occMap);
              const monthHint =
                cellMonth !== startMonth
                  ? new Date(tripYear, cellMonth - 1, 1).toLocaleString(
                      undefined,
                      { month: "short" },
                    )
                  : null;

              if (kind === "muted") {
                return (
                  <div
                    key={key}
                    className="flex min-h-[88px] items-start justify-center bg-stone-100/40 pt-1"
                  >
                    <span className="text-sm tabular-nums text-stone-300">
                      {monthHint ? (
                        <span className="flex flex-col items-center leading-tight">
                          <span className="text-[10px] font-medium text-stone-400">
                            {monthHint}
                          </span>
                          <span>{day}</span>
                        </span>
                      ) : (
                        day
                      )}
                    </span>
                  </div>
                );
              }

              if (kind === "checkoutMorning") {
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!clickable}
                    onClick={() => onDayClick(dateLocal)}
                    className={`min-h-[88px] w-full rounded-none border-0 p-1.5 text-left align-top transition disabled:cursor-not-allowed ${
                      inRangeVisual
                        ? "bg-cyan-200/90 ring-2 ring-cyan-600 ring-inset"
                        : clickable
                          ? "bg-amber-50/95 hover:bg-cyan-50/80"
                          : "cursor-default bg-amber-50/60 opacity-90"
                    } ${houseFull ? "opacity-50 saturate-75" : ""}`}
                  >
                    {monthHint && (
                      <div className="text-[10px] font-semibold text-teal-700/90">
                        {monthHint}
                      </div>
                    )}
                    <div className="mb-1 text-base font-bold tabular-nums text-teal-950">
                      {day}
                    </div>
                    <div className="flex flex-col gap-1">
                      {resources.map((res) => {
                        const occAm = occMap.get(
                          slotKey(res.id, dateLocal, "am"),
                        );
                        const occPm = occMap.get(
                          slotKey(res.id, dateLocal, "pm"),
                        );
                        const display = resourceDayOccupancy(occAm, occPm);
                        const resKey =
                          res.sortOrder === 0 ? "queen" : "sofa";
                        return (
                          <div
                            key={res.id}
                            className={`rounded-md px-1 py-0.5 text-[10px] leading-tight ${
                              resKey === "queen"
                                ? "bg-orange-100/90 text-orange-950"
                                : "bg-violet-100/90 text-violet-950"
                            }`}
                          >
                            <span className="block font-bold opacity-90">
                              {resourceLabel(res)}
                            </span>
                            <OccupancyBody display={display} />
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => onDayClick(dateLocal)}
                  className={`min-h-[88px] w-full rounded-none border-0 p-1.5 text-left align-top transition disabled:cursor-not-allowed ${
                    inRangeVisual
                      ? "bg-cyan-200/90 ring-2 ring-cyan-600 ring-inset"
                      : clickable
                        ? "bg-white/95 hover:bg-cyan-50/80"
                        : "bg-white/80 opacity-80"
                  } ${houseFull ? "opacity-50 saturate-75" : ""}`}
                >
                  {monthHint && (
                    <div className="text-[10px] font-semibold text-teal-700/90">
                      {monthHint}
                    </div>
                  )}
                  <div className="mb-1 text-base font-bold tabular-nums text-teal-950">
                    {day}
                  </div>
                  <div className="flex flex-col gap-1">
                    {resources.map((res) => {
                      const occAm = occMap.get(
                        slotKey(res.id, dateLocal, "am"),
                      );
                      const occPm = occMap.get(
                        slotKey(res.id, dateLocal, "pm"),
                      );
                      const display = resourceDayOccupancy(occAm, occPm);
                      const resKey =
                        res.sortOrder === 0 ? "queen" : "sofa";
                      return (
                        <div
                          key={res.id}
                          className={`rounded-md px-1 py-0.5 text-[10px] leading-tight ${
                            resKey === "queen"
                              ? "bg-orange-100/90 text-orange-950"
                              : "bg-violet-100/90 text-violet-950"
                          }`}
                        >
                          <span className="block font-bold opacity-90">
                            {resourceLabel(res)}
                          </span>
                          <OccupancyBody display={display} />
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs font-medium text-teal-900">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-sm bg-orange-200 ring-1 ring-orange-400/50"
            aria-hidden
          />
          Queen room
        </span>
        {hasSofaBed && (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-sm bg-violet-200 ring-1 ring-violet-400/50"
              aria-hidden
            />
            Sofa bed
          </span>
        )}
        <span className="inline-flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-sm bg-cyan-200 ring-1 ring-cyan-600"
            aria-hidden
          />
          Your dates
        </span>
        <span className="inline-flex items-center gap-2 text-teal-900/80">
          <span
            className="h-3 w-3 rounded-sm bg-white opacity-50 ring-1 ring-stone-400/60"
            aria-hidden
          />
          Dimmed day:{" "}
          {hasSofaBed
            ? "queen room and sofa both full"
            : "guest room fully booked (a.m. and p.m.)"}
        </span>
      </div>

      {(planErr || submitMsg) && (
        <div className="space-y-2 text-sm">
          {planErr && (
            <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
              {planErr}
            </p>
          )}
          {submitMsg && (
            <p className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-950">
              {submitMsg}
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border-2 border-teal-200/60 bg-white/90 p-5 shadow-md shadow-teal-900/5">
        <h3 className="text-lg font-semibold text-teal-950">
          Your stay{" "}
          {checkIn && checkOut
            ? `(${formatDayLabel(checkIn)} → ${formatDayLabel(checkOut)})`
            : "(tap two days above)"}
        </h3>
        {checkIn && checkOut && plannedSlots.length > 0 && !planErr && (
          <p className="mt-1 text-sm text-teal-800/90">
            We’ll hold from the <strong>afternoon</strong> of your first day
            through the <strong>morning</strong> you leave—so someone else can
            arrive the same afternoon if you’re heading out that morning.
          </p>
        )}

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-semibold text-teal-950">
            Where you’ll sleep
          </legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-teal-900">
            <input
              type="checkbox"
              checked={bookQueen}
              onChange={(e) => setBookQueen(e.target.checked)}
              className="size-4 rounded border-teal-600 text-teal-600 focus:ring-teal-500"
            />
            Queen guest room
          </label>
          {hasSofaBed && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-teal-900">
              <input
                type="checkbox"
                checked={bookSofa}
                onChange={(e) => setBookSofa(e.target.checked)}
                className="size-4 rounded border-teal-600 text-teal-600 focus:ring-teal-500"
              />
              Double sofa bed (living area)
            </label>
          )}
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-teal-900">Your name</span>
            <input
              className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 placeholder:text-teal-900/40 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              autoComplete="name"
              placeholder="Jamie Smith"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-teal-900">Email</span>
            <input
              className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 placeholder:text-teal-900/40 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              type="email"
              placeholder="you@email.com"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-teal-900">
              Note to the group (optional)
            </span>
            <input
              className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bringing a kid, late arrival, etc."
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={
              submitting ||
              !checkIn ||
              !checkOut ||
              plannedSlots.length === 0 ||
              !!planErr
            }
            onClick={() => void submitBooking()}
            className="rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-900/20 transition hover:from-orange-600 hover:to-rose-600 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? "Saving…" : "Save to calendar"}
          </button>
          {(checkIn || checkOut) && (
            <button
              type="button"
              onClick={clearDates}
              className="rounded-full border-2 border-teal-300 bg-white px-5 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
