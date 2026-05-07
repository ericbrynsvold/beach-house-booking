"use client";

import { useCallback, useEffect, useState } from "react";
import type { HalfSlot } from "@/db/schema";
import { enumerateHalfDaysInclusive } from "@/lib/slots";

type SlotRow = { dateLocal: string; slot: HalfSlot };

type ResRow = {
  id: number;
  resourceId: number;
  guestName: string;
  email: string;
  notes: string | null;
  slots: SlotRow[];
};

type AuditRow = {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: number | null;
  metadata: Record<string, unknown> | null;
};

export function AdminClient() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [rows, setRows] = useState<ResRow[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setErr(null);
    const [r1, r2] = await Promise.all([
      fetch("/api/admin/reservations", { credentials: "include" }),
      fetch("/api/admin/audit", { credentials: "include" }),
    ]);
    if (r1.status === 403 || r2.status === 403) {
      setAuthed(false);
      setRows(null);
      setAudit(null);
      return;
    }
    if (!r1.ok) {
      setErr(await r1.text());
      return;
    }
    if (!r2.ok) {
      setErr(await r2.text());
      return;
    }
    setAuthed(true);
    setRows(await r1.json());
    setAudit(await r2.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      await refresh();
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Login failed");
        return;
      }
      setSecret("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this reservation?")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/reservations/${id}`, {
        method: "DELETE",
        credentials: "include",
        redirect: "manual",
      });
      if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) {
        setErr(
          "Session issue—open the unlock page, enter the family passphrase again, then return to Admin.",
        );
        return;
      }
      if (!r.ok) {
        const text = await r.text();
        try {
          const j = JSON.parse(text) as { error?: string };
          setErr(j.error ?? text);
        } catch {
          setErr(
            text.slice(0, 120) || `Could not delete (HTTP ${r.status}). Try refreshing.`,
          );
        }
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <p className="text-sm text-slate-600">Loading…</p>;
  }

  if (!authed) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
        <p className="text-sm text-slate-600">
          Enter the admin secret to manage bookings and view the audit log.
        </p>
        <form className="space-y-2" onSubmit={(e) => void login(e)}>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="ADMIN_SECRET"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          Admin — reservations
        </h1>
        <button
          type="button"
          className="text-sm text-sky-800 underline"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h2 className="font-semibold text-slate-900">
          Export whole-house calendar
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Use these in Apple Calendar, Google, Outlook, etc. Includes every
          guest—not just one person.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <a
            className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800"
            href="/api/calendar.ics"
          >
            Everyone (merged)
          </a>
          <a
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100"
            href="/api/calendar.ics?resourceId=1"
          >
            Queen room only
          </a>
          <a
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100"
            href="/api/calendar.ics?resourceId=2"
          >
            Sofa bed only
          </a>
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Guest</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2">Slots</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2">{r.guestName}</td>
                <td className="px-3 py-2 text-xs">{r.email}</td>
                <td className="px-3 py-2">{r.resourceId}</td>
                <td className="max-w-xs px-3 py-2 font-mono text-[11px] text-slate-700">
                  {r.slots.map((s) => `${s.dateLocal} ${s.slot}`).join(", ")}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="text-red-700 underline"
                    disabled={busy}
                    onClick={() => void remove(r.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminQuickCreate
        disabled={busy}
        onCreated={() => void refresh()}
      />

      <section>
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          Audit log (last 500)
        </h2>
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Meta</th>
              </tr>
            </thead>
            <tbody>
              {audit?.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-3 py-1 font-mono">{a.id}</td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    {new Date(a.at).toLocaleString()}
                  </td>
                  <td className="px-3 py-1">{a.actor}</td>
                  <td className="px-3 py-1">{a.action}</td>
                  <td className="px-3 py-1">
                    {a.entity} {a.entityId ?? ""}
                  </td>
                  <td className="max-w-xs truncate px-3 py-1 font-mono text-[10px]">
                    {a.metadata ? JSON.stringify(a.metadata) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AdminQuickCreate(props: {
  disabled: boolean;
  onCreated: () => void;
}) {
  const [resourceId, setResourceId] = useState(1);
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startSlot, setStartSlot] = useState<HalfSlot>("am");
  const [endDate, setEndDate] = useState("");
  const [endSlot, setEndSlot] = useState<HalfSlot>("pm");
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    let slots: { dateLocal: string; slot: HalfSlot }[];
    try {
      slots = enumerateHalfDaysInclusive(
        { dateLocal: startDate, slot: startSlot },
        { dateLocal: endDate, slot: endSlot },
      );
    } catch {
      setMsg("Invalid date range.");
      return;
    }
    const r = await fetch("/api/admin/reservations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceId,
        guestName: guestName.trim(),
        email: email.trim(),
        notes: notes.trim() || null,
        slots,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(j.error ?? r.statusText);
      return;
    }
    setMsg(`Created reservation #${j.id}`);
    setGuestName("");
    setEmail("");
    props.onCreated();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">
        Add reservation (admin)
      </h2>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => void submit(e)}
      >
        <label className="text-sm">
          Resource
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={resourceId}
            onChange={(e) => setResourceId(Number(e.target.value))}
          >
            <option value={1}>1 — Guest room</option>
            <option value={2}>2 — Sofa bed</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-1">
          Guest name
          <input
            required
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Email
          <input
            required
            type="email"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Notes
          <input
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Start date
          <input
            required
            type="date"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Start half
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={startSlot}
            onChange={(e) => setStartSlot(e.target.value as HalfSlot)}
          >
            <option value="am">AM</option>
            <option value="pm">PM</option>
          </select>
        </label>
        <label className="text-sm">
          End date
          <input
            required
            type="date"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label className="text-sm">
          End half
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
            value={endSlot}
            onChange={(e) => setEndSlot(e.target.value as HalfSlot)}
          >
            <option value="am">AM</option>
            <option value="pm">PM</option>
          </select>
        </label>
        {msg && (
          <p className="sm:col-span-2 text-sm text-slate-700">{msg}</p>
        )}
        <button
          type="submit"
          disabled={props.disabled}
          className="sm:col-span-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
        >
          Create
        </button>
      </form>
    </section>
  );
}
