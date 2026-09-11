import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/admin-auth";
import { getConfig } from "@/lib/server-connector";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const config = getConfig();
  if (!isValidAdminCookie(config.adminSecret, jar.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/login");
  }
  return <>{children}</>;
}
