import Link from "next/link";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#ecfeff_0%,#fffbeb_45%,#fef3c7_100%)]">
      <header className="border-b-2 border-teal-700/15 bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-600 shadow-md shadow-teal-900/20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3.5">
          <Link
            href="/calendar"
            className="text-lg font-bold tracking-tight text-white drop-shadow-sm"
          >
            Santa Rosa Beach
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm font-semibold">
            <Link
              className="rounded-full px-3 py-1.5 text-white/95 hover:bg-white/15"
              href="/calendar"
            >
              Calendar
            </Link>
            <Link
              className="rounded-full px-3 py-1.5 text-white/95 hover:bg-white/15"
              href="/trip"
            >
              Trip info
            </Link>
            <Link
              className="rounded-full px-3 py-1.5 text-white/95 hover:bg-white/15"
              href="/me"
            >
              Your bookings
            </Link>
            <Link
              className="rounded-full px-3 py-1.5 text-amber-100/95 hover:bg-white/15"
              href="/admin"
            >
              Host
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
