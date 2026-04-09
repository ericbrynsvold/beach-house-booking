import { SignJWT, jwtVerify } from "jose";
import { ADMIN_COOKIE, SITE_COOKIE } from "@/lib/cookie-names";

function getSessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(s);
}

function getGuestJwtSecret() {
  const s = process.env.GUEST_JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("GUEST_JWT_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(s);
}

export async function signSiteToken(): Promise<string> {
  return new SignJWT({ typ: "site" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSessionSecret());
}

export async function verifySiteToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return payload.typ === "site";
  } catch {
    return false;
  }
}

export async function signAdminToken(): Promise<string> {
  return new SignJWT({ typ: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSessionSecret());
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return payload.typ === "admin";
  } catch {
    return false;
  }
}

export async function signGuestToken(email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  return new SignJWT({ typ: "guest", email: e })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(e)
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getGuestJwtSecret());
}

export async function verifyGuestToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getGuestJwtSecret());
    if (payload.typ !== "guest") return null;
    const email = typeof payload.email === "string" ? payload.email : payload.sub;
    return email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export { ADMIN_COOKIE, SITE_COOKIE };
