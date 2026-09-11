import { requireApiKey } from "@/http/auth";
import { jsonError } from "@/http/errors";
import { getConnector } from "@/lib/server-connector";

export async function GET(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    requireApiKey(request);
    const { clientId } = await context.params;
    const snapshot = await getConnector().getInstallationSnapshot(clientId);
    return Response.json(snapshot);
  } catch (error) {
    return jsonError(error);
  }
}
