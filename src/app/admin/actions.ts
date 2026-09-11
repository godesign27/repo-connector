"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  adminCookieValue,
  requireAdminSession,
} from "@/lib/admin-auth";
import { getConfig, getConnector } from "@/lib/server-connector";

async function guard(): Promise<void> {
  await requireAdminSession(getConfig().adminSecret);
}

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const config = getConfig();
  if (password !== config.adminSecret) {
    redirect("/admin/login?error=1");
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, adminCookieValue(config.adminSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

export async function requestInstallAction(formData: FormData): Promise<void> {
  await guard();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const result = await getConnector().requestInstallation({ clientId });
  redirect(
    `/admin?clientId=${encodeURIComponent(clientId)}&installUrl=${encodeURIComponent(result.installUrl)}`,
  );
}

export async function completeMockInstallAction(
  formData: FormData,
): Promise<void> {
  await guard();
  const clientId = String(formData.get("clientId") ?? "").trim();
  getConnector().completeMockInstall(clientId);
  redirect(`/admin?clientId=${encodeURIComponent(clientId)}`);
}

export async function approveAction(formData: FormData): Promise<void> {
  await guard();
  const clientId = String(formData.get("clientId") ?? "").trim();
  await getConnector().approveInstallation(clientId, { actor: "admin" });
  redirect(`/admin?clientId=${encodeURIComponent(clientId)}`);
}

export async function rejectAction(formData: FormData): Promise<void> {
  await guard();
  const clientId = String(formData.get("clientId") ?? "").trim();
  await getConnector().rejectInstallation(clientId, { actor: "admin" });
  redirect(`/admin?clientId=${encodeURIComponent(clientId)}`);
}

export async function revokeAction(formData: FormData): Promise<void> {
  await guard();
  const clientId = String(formData.get("clientId") ?? "").trim();
  await getConnector().revokeAccess(clientId, { actor: "admin" });
  redirect(`/admin?clientId=${encodeURIComponent(clientId)}`);
}
