import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SITE_COOKIE } from "@/lib/cookie-names";

function getSessionSecretBytes() {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 16 ? new TextEncoder().encode(s) : null;
}

async function siteCookieValid(token: string): Promise<boolean> {
  const secret = getSessionSecretBytes();
  if (!secret) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.typ === "site";
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/unlock" || pathname.startsWith("/unlock/")) {
    return NextResponse.next();
  }
  // APIs enforce their own auth (JSON). Do not redirect fetches to /unlock HTML.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  // Guest magic link: page is safe without passphrase; APIs require JWT.
  if (pathname === "/me" || pathname.startsWith("/me/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SITE_COOKIE)?.value;
  if (token && (await siteCookieValid(token))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  url.searchParams.set(
    "next",
    `${pathname}${request.nextUrl.search ?? ""}`,
  );
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
