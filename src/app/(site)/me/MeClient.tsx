"use client";

import { useCallback, useEffect, useState } from "react";
import type { HalfSlot } from "@/db/schema";
import { enumerateHalfDaysInclusive } from "@/lib/slots";
import { googleCalendarUrl, slotsToUtcRange } from "@/lib/ical";

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

/** Plain-language stay window from half-day slots. */
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

export function MeClient() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<ResRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setErr(null);
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
    setRows(await r.json());
  }, [token]);

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  async function remove(id: number) {
    if (!token || !confirm("Remove this reservation from the house calendar?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/reservations/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) setErr(friendlyApiError(await readErrorMessage(r)));
      await fetchMe();
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
      setErr(
        "Those dates don’t connect as one stay—pick a first day and last day that work with how the calendar counts nights.",
      );
      return;
    }
    setBusy(true);
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
        const text = await r.text();
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* plain text */
        }
        setErr(friendlyApiError(msg));
      }
      await fetchMe();
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
          dates if something changed, or drop a reservation.
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
        {rows?.map((r) => (
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
              disabled={busy}
              onSave={(a, b, c, d) => void updateRange(r.id, a, b, c, d)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditRangeForm(props: {
  disabled: boolean;
  onSave: (
    startDate: string,
    startSlot: HalfSlot,
    endDate: string,
    endSlot: HalfSlot,
  ) => void;
}) {
  const [startDate, setStartDate] = useState("");
  const [startSlot, setStartSlot] = useState<HalfSlot>("pm");
  const [endDate, setEndDate] = useState("");
  const [endSlot, setEndSlot] = useState<HalfSlot>("am");

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-teal-200/60 bg-gradient-to-b from-teal-50/50 to-amber-50/40 p-4 text-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!startDate || !endDate) return;
        props.onSave(startDate, startSlot, endDate, endSlot);
      }}
    >
      <p className="sm:col-span-2 text-sm leading-relaxed text-teal-900/88">
        <strong className="text-teal-950">Change your nights</strong> on the same bed you picked. Counts the same
        way as the big calendar: from the <strong>afternoon you arrive</strong> through the{" "}
        <strong>morning you leave</strong>.
      </p>
      <label className="block text-teal-900">
        <span className="font-medium">First calendar day</span>
        <input
          type="date"
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </label>
      <label className="block text-teal-900">
        <span className="font-medium">Arriving that day</span>
        <select
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={startSlot}
          onChange={(e) => setStartSlot(e.target.value as HalfSlot)}
        >
          <option value="pm">Afternoon / evening (usual)</option>
          <option value="am">Morning</option>
        </select>
      </label>
      <label className="block text-teal-900">
        <span className="font-medium">Last calendar day</span>
        <input
          type="date"
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
        />
      </label>
      <label className="block text-teal-900">
        <span className="font-medium">Leaving that day</span>
        <select
          className="mt-1 w-full rounded-xl border-2 border-teal-200 bg-white px-3 py-2 text-teal-950 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          value={endSlot}
          onChange={(e) => setEndSlot(e.target.value as HalfSlot)}
        >
          <option value="am">Morning (usual)</option>
          <option value="pm">Afternoon</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={props.disabled}
        className="sm:col-span-2 rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-teal-900/15 transition hover:from-teal-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Save new dates
      </button>
    </form>
  );
}
