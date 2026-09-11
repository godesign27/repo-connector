import { redirect } from "next/navigation";
import { getConnector } from "@/lib/server-connector";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const installationId = url.searchParams.get("installation_id");
  if (!state || !installationId) {
    redirect("/install/done?error=missing_params");
  }

  let clientId: string;
  try {
    clientId = getConnector().bindFromCallback(state, installationId);
  } catch {
    redirect("/install/done?error=invalid_state");
  }

  const status = await getConnector().getInstallationStatus(clientId);
  redirect(
    `/install/done?clientId=${encodeURIComponent(clientId)}&status=${status}`,
  );
}
