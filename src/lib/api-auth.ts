import { cookies } from "next/headers";
import { ADMIN_COOKIE, SITE_COOKIE } from "@/lib/cookie-names";
import { verifyAdminToken, verifyGuestToken, verifySiteToken } from "@/lib/tokens";

export async function requireSiteCookie(): Promise<boolean> {
  const jar = await cookies();
  const v = jar.get(SITE_COOKIE)?.value;
  if (!v) return false;
  return verifySiteToken(v);
}

export async function requireAdminCookie(): Promise<boolean> {
  const jar = await cookies();
  const v = jar.get(ADMIN_COOKIE)?.value;
  if (!v) return false;
  return verifyAdminToken(v);
}

export async function getGuestEmailFromRequest(
  request: Request,
): Promise<string | null> {
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (bearer) {
    return verifyGuestToken(bearer);
  }
  return null;
}
