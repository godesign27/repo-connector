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
    const repos = await getConnector().listAccessibleRepos(clientId);
    return Response.json({ repos });
  } catch (error) {
    return jsonError(error);
  }
}
