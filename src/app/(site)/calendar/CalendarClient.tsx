"use client";

import Link from "next/link";
import { useState } from "react";
import { MonthGrid } from "@/components/MonthGrid";

function CalendarDownloads() {
  const [meUrl] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const t = sessionStorage.getItem("bh_guest_jwt");
    return t ? `/api/calendar/me.ics?token=${encodeURIComponent(t)}` : null;
  });

  return (
    <section className="rounded-2xl border-2 border-teal-200/50 bg-white/85 p-5 shadow-sm">
      <h2 className="text-base font-semibold text-teal-950">
        Add this trip to your own calendar
      </h2>
      <p className="mt-1 text-sm text-teal-800/85">
        Download a small file and open it with Apple Calendar, Google Calendar,
        Outlook, or your phone—so your stay shows up next to the rest of your
        life.
      </p>

      {meUrl ? (
        <div className="mt-4">
          <a
            className="inline-flex items-center rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-teal-700"
            href={meUrl}
          >
            Download my stay only
          </a>
          <p className="mt-2 text-xs text-teal-800/75">
            This uses the same personal link as <Link className="font-medium text-teal-900 underline" href="/me">Your bookings</Link>—only
            your reservations, not everyone’s.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-teal-50/80 px-3 py-2 text-sm text-teal-900">
          <strong>Your personal file:</strong> after you book, open the link
          emailed to you (or go to{" "}
          <Link className="font-semibold text-teal-800 underline" href="/me">
            Your bookings
          </Link>
          ), then come back here—we’ll offer “my stay only” once this browser
          remembers your link.
        </div>
      )}

      <p className="mt-4 text-xs text-teal-800/70">
        <strong>Hosting?</strong> The{" "}
        <Link className="font-semibold text-teal-900 underline" href="/admin">
          Host
        </Link>{" "}
        page has a download that includes <em>everyone’s</em> reservations for
        the house.
      </p>
    </section>
  );
}

export function CalendarClient(props: {
  stayStart: string;
  stayEndExclusive: string;
}) {
  const { stayStart, stayEndExclusive } = props;

  const [, refresh] = useState(0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-amber-200/60 bg-gradient-to-br from-cyan-50 via-white to-amber-50 p-6 shadow-md shadow-teal-900/10">
        <h1 className="text-2xl font-bold tracking-tight text-teal-950 sm:text-3xl">
          Who’s here when
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-teal-900/85">
          Claim the <strong>guest room</strong> and/or the <strong>sofa bed</strong>{" "}
          for part of the month we’re at the beach. Orange is the queen room,
          purple is the sofa. Only the nights we’re sharing the rental stay open—
          other squares stay empty.
        </p>
      </div>

      <MonthGrid
        stayStart={stayStart}
        stayEndExclusive={stayEndExclusive}
        onBooked={() => refresh((n) => n + 1)}
      />

      <CalendarDownloads />
    </div>
  );
}
