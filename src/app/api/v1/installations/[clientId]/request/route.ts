import { requireApiKey } from "@/http/auth";
import { jsonError } from "@/http/errors";
import { getConnector } from "@/lib/server-connector";

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
) {
  try {
    requireApiKey(request);
    const { clientId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      provider?: "github";
    };
    const result = await getConnector().requestInstallation({
      clientId,
      provider: body.provider,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
