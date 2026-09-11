import { requireAdminOrApiKey } from "@/http/auth";
import { jsonError } from "@/http/errors";
import { getConnector } from "@/lib/server-connector";

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    const auth = requireAdminOrApiKey(request);
    const { clientId } = await context.params;
    const result = await getConnector().approveInstallation(clientId, {
      actor: auth.actor,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
