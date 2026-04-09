import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SITE_COOKIE, signSiteToken } from "@/lib/tokens";

export async function POST(request: Request) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 16) {
    return NextResponse.json(
      {
        error:
          "SESSION_SECRET is missing or shorter than 16 characters. Add it to .env.local (see .env.example), save, then restart `npm run dev`.",
      },
      { status: 500 },
    );
  }

  const expected = process.env.SITE_PASSPHRASE;
  if (!expected) {
    return NextResponse.json(
      { error: "SITE_PASSPHRASE is not configured" },
      { status: 500 },
    );
  }
  let body: { passphrase?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.passphrase !== expected) {
    return NextResponse.json({ error: "Incorrect passphrase" }, { status: 401 });
  }
  const jwt = await signSiteToken();
  const jar = await cookies();
  jar.set(SITE_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true });
}
