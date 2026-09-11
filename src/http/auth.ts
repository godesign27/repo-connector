import { safeEqualHex, sha256Hex } from "@/db/crypto";
import { getConfig } from "@/lib/server-connector";
import { isValidAdminCookie, ADMIN_COOKIE } from "@/lib/admin-auth";

export function actorFromRequest(request: Request, fallback: string): string {
  return request.headers.get("x-actor")?.trim() || fallback;
}

export function requireApiKey(request: Request): void {
  const config = getConfig();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (
    !token ||
    !safeEqualHex(sha256Hex(token), sha256Hex(config.apiKey))
  ) {
    throw new ApiUnauthorizedError();
  }
}

export function requireAdminOrApiKey(
  request: Request,
): { actor: string } {
  const config = getConfig();
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieValue = readCookie(cookieHeader, ADMIN_COOKIE);
  if (isValidAdminCookie(config.adminSecret, cookieValue)) {
    return { actor: actorFromRequest(request, "admin") };
  }
  requireApiKey(request);
  return { actor: actorFromRequest(request, "api") };
}

export class ApiUnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor() {
    super("Missing or invalid API credentials");
    this.name = "ApiUnauthorizedError";
  }
}

function readCookie(header: string, name: string): string | undefined {
  const parts = header.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}
