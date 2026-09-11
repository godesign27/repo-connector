import { cookies } from "next/headers";
import { hmacHex, safeEqualHex } from "@/db/crypto";

export const ADMIN_COOKIE = "rc_admin";

export function adminCookieValue(secret: string): string {
  return hmacHex(secret, "repo-connector-admin-session");
}

export function isValidAdminCookie(
  secret: string,
  value: string | undefined,
): boolean {
  if (!value) {
    return false;
  }
  return safeEqualHex(value, adminCookieValue(secret));
}

export async function requireAdminSession(secret: string): Promise<void> {
  const jar = await cookies();
  if (!isValidAdminCookie(secret, jar.get(ADMIN_COOKIE)?.value)) {
    throw new Error("Admin session required");
  }
}
