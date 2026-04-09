"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function UnlockForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/calendar";
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pass }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Could not unlock");
        return;
      }
      router.replace(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-slate-100 px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-md">
        <h1 className="text-xl font-semibold text-slate-900">
          House passphrase
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the shared passphrase to open the calendar and trip pages.
        </p>
        <form className="mt-6 space-y-3" onSubmit={(e) => void submit(e)}>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="Passphrase"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-sky-800 py-2 font-medium text-white hover:bg-sky-900 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
