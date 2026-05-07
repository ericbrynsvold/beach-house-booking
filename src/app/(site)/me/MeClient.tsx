"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HalfSlot } from "@/db/schema";
import type { OccupancyRow } from "@/lib/occupancy-data";
import { googleCalendarUrl, slotsToUtcRange } from "@/lib/ical";
import {
  enumerateHalfDaysInclusive,
  getLastNightDate,
  isSlotBookable,
  nightCountFromGuestHalfSlots,
  slotKey,
  slotSortKey,
} from "@/lib/slots";

type SlotRow = { dateLocal: string; slot: HalfSlot };

type ResRow = {
  id: number;
  resourceId: number;
  guestName: string;
  email: string;
  notes: string | null;
  resourceName: string;
  resourceSortOrder: number;
  slots: SlotRow[];
};

function spotLabel(sortOrder: number, fallbackName: string): string {
  if (sortOrder === 0) return "Queen guest room";
  if (sortOrder === 1) return "Sofa bed (living area)";
  return fallbackName
    .replace("Guest ", "")
    .replace(" (", " — ")
    .replace(")", "");
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function stayDescription(slots: SlotRow[]): string {
  if (slots.length === 0) return "No nights on file yet.";
  const first = slots[0]!;
  const last = slots[slots.length - 1]!;

  if (first.dateLocal === last.dateLocal) {
    if (first.slot !== last.slot) {
      return `Full calendar day on ${formatLongDate(first.dateLocal)} (morning through evening).`;
    }
    return `Part of ${formatLongDate(first.dateLocal)} (${first.slot === "am" ? "morning" : "afternoon / evening"} only).`;
  }

  const startPhrase =
    first.slot === "pm"
      ? `arriving the afternoon or evening of ${formatLongDate(first.dateLocal)}`
      : `arriving the morning of ${formatLongDate(first.dateLocal)}`;
  const endPhrase =
    last.slot === "am"
      ? `leaving the morning of ${formatLongDate(last.dateLocal)}`
      : `through the afternoon of ${formatLongDate(last.dateLocal)}`;

  return `You’re on the calendar from ${startPhrase}, through ${endPhrase}.`;
}

function stayMonthSlices(
  stayStart: string,
  stayEndExclusive: string,
): { y: number; m: number }[] {
  const ys = Number(stayStart.slice(0, 4));
  const ms = Number(stayStart.slice(5, 7));
  const ye = Number(stayEndExclusive.slice(0, 4));
  const me = Number(stayEndExclusive.slice(5, 7));
  const out: { y: number; m: number }[] = [];
  let y = ys;
  let m = ms;
  for (;;) {
    out.push({ y, m });
    if (y === ye && m === me) break;
    if (m === 12) {
      m = 1;
      y++;
    } else {
      m++;
    }
    if (out.length > 36) break;
  }
  return out;
}

function slotsSignature(slots: SlotRow[]): string {
  return slots.map((s) => `${s.dateLocal}_${s.slot}`).join(",");
}

function slotRangeDefaults(slots: SlotRow[]): {
  startDate: string;
  startSlot: HalfSlot;
  endDate: string;
  endSlot: HalfSlot;
} | null {
  if (slots.length === 0) return null;
  const sorted = [...slots].sort(
    (a, b) =>
      slotSortKey(a.dateLocal, a.slot) - slotSortKey(b.dateLocal, b.slot),
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return {
    startDate: first.dateLocal,
    startSlot: first.slot,
    endDate: last.dateLocal,
    endSlot: last.slot,
  };
}

async function readErrorMessage(r: Response): Promise<string> {
  const text = await r.text();
  try {
    const j = JSON.parse(text) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* use raw text */
  }
  return text || `Something went wrong (${r.status}).`;
}

function friendlyApiError(message: string): string {
  const m = message.trim();
  if (/guest token required/i.test(m)) {
    return "We couldn’t verify your link. Open the address from your booking email again (the same browser is fine once it’s worked once).";
  }
  return m;
}

export function MeClient(props: {
  stayStart: string;
  stayEndExclusive: string;
  blackoutDates: string[];
  maxStayNights: number;
}) {
  const { stayStart, stayEndExclusive, blackoutDates, maxStayNights } = props;

  const lastNight = useMemo(
    () => getLastNightDate(stayEndExclusive),
    [stayEndExclusive],
  );
  const blackoutSet = useMemo(
    () => new Set(blackoutDates) as ReadonlySet<string>,
    [blackoutDates],
  );
  const blackoutLabel = useMemo(() => {
    if (blackoutDates.length === 0) return "the blackout period";
    const sorted = [...blackoutDates].sort();
    const a = sorted[0]!;
    const b = sorted[sorted.length - 1]!;
    if (a === b) return formatLongDate(a);
    return `${formatLongDate(a)}–${formatLongDate(b)}`;
  }, [blackoutDates]);

  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<ResRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [houseOcc, setHouseOcc] = useState<OccupancyRow[]>([]);
  const [occErr, setOccErr] = useState<string | null>(null);
  const [saveErrById, setSaveErrById] = useState<Record<number, string>>({});
  const [saveSuccessById, setSaveSuccessById] = useState<
    Record<number, { emailSent: boolean; devMagicLink?: string }>
  >({});

  useEffect(() => {
    const u = new URL(typeof window !== "undefined" ? window.location.href : "");
    const t = u.searchParams.get("token");
    if (t) {
      sessionStorage.setItem("bh_guest_jwt", t);
      u.searchParams.delete("token");
      window.history.replaceState({}, "", u.pathname + u.search);
      setToken(t);
    } else {
      setToken(sessionStorage.getItem("bh_guest_jwt"));
    }
  }, []);

  const fetchMe = useCallback(async () => {
    if (!token) {
      setRows(null);
      return;
    }
    const r = await fetch("/api/reservations/me", {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const raw = await readErrorMessage(r);
      setErr(friendlyApiError(raw));
      setRows(null);
      return;
    }
    setErr(null);
    setRows(await r.json());
  }, [token]);

  const loadOccupancy = useCallback(async () => {
    if (!token) {
      setHouseOcc([]);
      return;
    }
    setOccErr(null);
    const months = stayMonthSlices(stayStart, stayEndExclusive);
    try {
      const parts: OccupancyRow[] = [];
      for (const { y, m } of months) {
        const r = await fetch(
          `/api/reservations/me/occupancy?year=${y}&month=${m}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!r.ok) {
          const msg = await readErrorMessage(r);
          setOccErr(friendlyApiError(msg));
          setHouseOcc([]);
          return;
        }
        const j = (await r.json()) as { occupancy: OccupancyRow[] };
        parts.push(...j.occupancy);
      }
      setHouseOcc(parts);
    } catch (e) {
      setOccErr((e as Error).message);
      setHouseOcc([]);
    }
  }, [token, stayStart, stayEndExclusive]);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    void loadOccupancy();
  }, [loadOccupancy]);

  async function remove(id: number) {
    if (!token || !confirm("Remove this reservation from the house calendar?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/reservations/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        setErr(friendlyApiError(await readErrorMessage(r)));
        return;
      }
      setSaveErrById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSaveSuccessById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await fetchMe();
      await loadOccupancy();
    } finally {
      setBusy(false);
    }
  }

  async function updateRange(
    id: number,
    startDate: string,
    startSlot: HalfSlot,
    endDate: string,
    endSlot: HalfSlot,
  ) {
    if (!token) return;
    let slots: SlotRow[];
    try {
      slots = enumerateHalfDaysInclusive(
        { dateLocal: startDate, slot: startSlot },
        { dateLocal: endDate, slot: endSlot },
      );
    } catch {
      setSaveErrById((prev) => ({
        ...prev,
        [id]:
          "Those dates don’t connect as one stay—pick a first day and last day that work with how the calendar counts nights.",
      }));
      return;
    }
    setBusy(true);
    setSaveErrById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSaveSuccessById((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const r = await fetch(`/api/reservations/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slots }),
      });
      if (!r.ok) {
        const msg = friendlyApiError(await readErrorMessage(r));
        setSaveErrById((prev) => ({ ...prev, [id]: msg }));
        return;
      }
      const j = (await r.json()) as {
        confirmationEmailSent?: boolean;
        devMagicLink?: string;
      };
      setSaveSuccessById((prev) => ({
        ...prev,
        [id]: {
          emailSent: j.confirmationEmailSent === true,
          ...(j.devMagicLink ? { devMagicLink: j.devMagicLink } : {}),
        },
      }));
      await fetchMe();
      await loadOccupancy();
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="overflow-hidden rounded-2xl border-2 border-amber-200/90 bg-gradient-to-b from-amber-50/95 to-white p-5 shadow-md shadow-teal-900/10">
        <h1 className="text-xl font-semibold text-teal-950">Your bookings</h1>
        <p className="mt-2 text-sm leading-relaxed text-teal-900/90">
          <strong className="text-teal-950">Open the link</strong> from the email you got after saving dates on the
          calendar. This page remembers you in this browser after the first time.
        </p>
        <p className="mt-2 text-sm text-teal-800/85">
          If someone shared the house site with you but you haven’t booked yet, go to{" "}
          <strong>Calendar</strong> in the menu after entering the family passphrase.
        </p>
      </div>
    );
  }

  const meIcsUrl = `/api/calendar/me.ics?token=${encodeURIComponent(token)}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-teal-950">Your bookings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-900/88">
          Here’s what we have under your email. You can add these nights to your own calendar, tweak
          dates if something changed, or drop a reservation. Changes must stay inside the shared rental
          window and can’t overlap someone else on the same bed.
        </p>
      </div>

      <p className="text-sm text-teal-900/90">
        <a
          className="font-semibold text-teal-800 underline decoration-teal-400/60 underline-offset-2 hover:text-teal-950"
          href={meIcsUrl}
        >
          Download just your stays
        </a>{" "}
        <span className="text-teal-800/80">
          (phone or computer calendar—only your name, not everyone else’s).
        </span>
      </p>

      {err && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50/95 p-4 text-sm text-rose-900">
          {err}
        </div>
      )}

      {occErr && (
        <div className="rounded-xl border-2 border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-950">
          <strong className="text-amber-950">Calendar data:</strong> {occErr} We can’t check other guests’ bookings
          until this loads—try refreshing the page.
        </div>
      )}

      {rows === null && !err && (
        <p className="text-sm font-medium text-teal-700/85">Loading your reservations…</p>
      )}

      {rows?.length === 0 && (
        <p className="rounded-xl border-2 border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          We don’t see any saved nights for this link yet. If you just booked, try refreshing; otherwise hop over
          to <strong>Calendar</strong> and lock in your dates.
        </p>
      )}

      <ul className="space-y-5">
        {rows?.map((r) => {
          const blocked = new Set<string>();
          for (const o of houseOcc) {
            if (o.resourceId !== r.resourceId) continue;
            if (o.reservationId === r.id) continue;
            blocked.add(slotKey(o.resourceId, o.dateLocal, o.slot));
          }
          const initialRange = slotRangeDefaults(r.slots);
          return (
            <li
              key={r.id}
              className="overflow-hidden rounded-2xl border-2 border-teal-200/70 bg-white/95 p-5 shadow-md shadow-teal-900/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-teal-950">{r.guestName}</p>
                  <p className="mt-0.5 text-sm text-teal-800/85">
                    <span className="font-medium text-teal-900">
                      {spotLabel(r.resourceSortOrder, r.resourceName)}
                    </span>
                    <span className="text-teal-700/70"> · </span>
                    <span className="text-teal-800/75">{r.email}</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border-2 border-rose-200 bg-white px-4 py-1.5 text-sm font-medium text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
                  onClick={() => void remove(r.id)}
                >
                  Remove reservation
                </button>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-teal-900/90">
                {stayDescription(r.slots)}
              </p>

              {(() => {
                const range = slotsToUtcRange(r.slots);
                if (!range) return null;
                return (
                  <a
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cyan-800 underline decoration-cyan-500/50 underline-offset-2 hover:text-teal-950"
                    href={googleCalendarUrl({
                      title: `${r.guestName} — beach house`,
                      details: r.notes ?? undefined,
                      start: range.start,
                      end: range.end,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Add to Google Calendar (approximate times)
                  </a>
                );
              })()}

              <EditRangeForm
                key={`${r.id}-${slotsSignature(r.slots)}`}
                disabled={busy}
                resourceId={r.resourceId}
                blockedKeys={blocked}
                stayStart={stayStart}
                stayEndExclusive={stayEndExclusive}
                lastNight={lastNight}
                blackoutSet={blackoutSet}
                blackoutLabel={blackoutLabel}
                maxStayNights={maxStayNights}
                initialRange={initialRange}
                serverError={saveErrById[r.id] ?? null}
                onClearServerError={() =>
                  setSaveErrById((prev) => {
                    const next = { ...prev };
                    delete next[r.id];
                    return next;
                  })
                }
                onClearSuccess={() =>
                  setSaveSuccessById((prev) => {
                    const next = { ...prev };
                    delete next[r.id];
                    return next;
                  })
                }
                onSave={(a, b, c, d) => void updateRange(r.id, a, b, c, d)}
              />
              {saveSuccessById[r.id] && (
                <div className="mt-3 rounded-xl border-2 border-emerald-200/80 bg-emerald-50/95 px-4 py-3 text-sm leading-relaxed text-emerald-950">
                  <strong className="text-emerald-950">Stay updated.</strong>{" "}
                  {saveSuccessById[r.id].emailSent ? (
                    <>
                      We sent a fresh confirmation email to <span className="font-medium">{r.email}</span> with your
                      new dates.
                    </>
                  ) : (
                    <>
                      We couldn’t send a confirmation email (check Resend or your env). Your new dates are saved on
                      this page—
                      {saveSuccessById[r.id].devMagicLink ? (
                        <>
                          for testing you can open{" "}
                          <a
                            className="font-semibold text-emerald-900 underline decoration-emerald-500/60"
                            href={saveSuccessById[r.id].devMagicLink}
                          >
                            this manage link
                          </a>
                          .
                        </>
                      ) : (
                        <>use the link from your earlier email or ask the hosts.</>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditRangeForm(props: {
  disabled: boolean;
  resourceId: number;
  blockedKeys: ReadonlySet<string>;
  stayStart: string;
  stayEndExclusive: string;
  lastNight: string;
  blackoutSet: ReadonlySet<string>;
  blackoutLabel: string;
  maxStayNights: number;
  initialRange: {
    startDate: string;
    startSlot: HalfSlot;
    endDate: string;
    endSlot: HalfSlot;
  } | null;
  serverError: string | null;
  onClearServerError: () => void;
  onClearSuccess: () => void;
  onSave: (
    startDate: string,
    startSlot: HalfSlot,
    endDate: string,
    endSlot: HalfSlot,
  ) => void;
}) {
  const {
    disabled,
    resourceId,
    blockedKeys,
    stayStart,
    stayEndExclusive,
    lastNight,
    blackoutSet,
    blackoutLabel,
    maxStayNights,
    initialRange,
    serverError,
    onClearServerError,
    onClearSuccess,
    onSave,
  } = props;

  const [startDate, setStartDate] = useState(initialRange?.startDate ?? "");
  const [startSlot, setStartSlot] = useState<HalfSlot>(
    initialRange?.startSlot ?? "pm",
  );
  const [endDate, setEndDate] = useState(initialRange?.endDate ?? "");
  const [endSlot, setEndSlot] = useState<HalfSlot>(
    initialRange?.endSlot ?? "am",
  );
  const [localErr, setLocalErr] = useState<string | null>(null);

  function validate(
    st: string,
    ss: HalfSlot,
    ed: string,
    es: HalfSlot,
  ): string | null {
    if (!st || !ed) return "Choose both a first day and a last day.";
    if (ed <= st) {
      return "The morning you leave has to be after the day you arrive.";
    }
    let slots: { dateLocal: string; slot: HalfSlot }[];
    try {
      slots = enumerateHalfDaysInclusive(
        { dateLocal: st, slot: ss },
        { dateLocal: ed, slot: es },
      );
    } catch {
      return "Those dates don’t form one continuous stay.";
    }
    if (st < stayStart || st > lastNight) {
      return `Arrival has to fall between ${formatLongDate(stayStart)} and ${formatLongDate(lastNight)} (rental window).`;
    }
    if (ed < stayStart || ed > stayEndExclusive) {
      return `Last day has to fall between ${formatLongDate(stayStart)} and ${formatLongDate(stayEndExclusive)} (checkout morning can be ${formatLongDate(stayEndExclusive)}).`;
    }
    for (const s of slots) {
      if (
        !isSlotBookable(
          s.dateLocal,
          s.slot,
          stayStart,
          stayEndExclusive,
          blackoutSet,
        )
      ) {
        if (blackoutSet.has(s.dateLocal)) {
          return `Those dates overlap the arrival blackout (${blackoutLabel}). Pick dates outside that.`;
        }
        return "Those dates are outside the rental window for this trip.";
      }
    }
    const nights = nightCountFromGuestHalfSlots(slots);
    if (nights > maxStayNights) {
      return `Stays are limited to ${maxStayNights} nights for guests—shorten this range or ask a host for help.`;
    }
    for (const s of slots) {
      const k = slotKey(resourceId, s.dateLocal, s.slot);
      if (blockedKeys.has(k)) {
        return "Someone else already has this bed for part of that time—choose different dates.";
      }
    }
    return null;
  }

  function touchFields() {
    setLocalErr(null);
    onClearServerError();
    onClearSuccess();
  }

  const endMin = startDate || stayStart;

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-teal-200/60 bg-gradient-to-b from-teal-50/50 to-amber-50/40 p-4 text-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const msg = validate(startDate, startSlot, endDate, endSlot);
        if (msg) {
          setLocalErr(msg);
          return;
        }
        setLocalErr(null);
        onSave(startDate, startSlot, endDate, endSlot);
      }}
    >
      <p className="sm:col-span-2 text-sm leading-relaxed text-teal-900/88">
        <strong className="text-teal-950">Change your nights</strong> on the same bed you picked. Dates must stay
        inside the rental window, avoid blackout nights, respect the{" "}
        {maxStayNights}-night guest limit, and can’t overlap another booking for this bed.
      </p>
      <label className="block text-teal-900">
        <span className="font-medium">First calendar day</span>
        <input
          type="date"
          min={stayStart}
          max={lastNight}
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={startDate}
          onChange={(e) => {
            touchFields();
            setStartDate(e.target.value);
          }}
          required
        />
      </label>
      <label className="block text-teal-900">
        <span className="font-medium">Arriving that day</span>
        <select
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={startSlot}
          onChange={(e) => {
            touchFields();
            setStartSlot(e.target.value as HalfSlot);
          }}
        >
          <option value="pm">Afternoon / evening (usual)</option>
          <option value="am">Morning</option>
        </select>
      </label>
      <label className="block text-teal-900">
        <span className="font-medium">Last calendar day</span>
        <input
          type="date"
          min={endMin}
          max={stayEndExclusive}
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={endDate}
          onChange={(e) => {
            touchFields();
            setEndDate(e.target.value);
          }}
          required
        />
      </label>
      <label className="block text-teal-900">
        <span className="font-medium">Leaving that day</span>
        <select
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={endSlot}
          onChange={(e) => {
            touchFields();
            setEndSlot(e.target.value as HalfSlot);
          }}
        >
          <option value="am">Morning (usual)</option>
          <option value="pm">Afternoon</option>
        </select>
      </label>
      {(localErr || serverError) && (
        <div className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50/95 px-3 py-2 text-sm text-rose-900">
          {localErr ?? serverError}
        </div>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="sm:col-span-2 rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-teal-900/15 transition hover:from-teal-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Save new dates
      </button>
    </form>
  );
}
