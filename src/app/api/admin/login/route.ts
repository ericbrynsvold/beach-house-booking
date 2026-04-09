import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, signAdminToken } from "@/lib/tokens";

export async function POST(request: Request) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500 },
    );
  }
  let body: { secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.secret !== expected) {
    return NextResponse.json({ error: "Incorrect secret" }, { status: 401 });
  }
  const jwt = await signAdminToken();
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return NextResponse.json({ ok: true });
}
