import { jsonError } from "@/http/errors";
import { getConfig, getConnector } from "@/lib/server-connector";
import { GitHubProvider } from "@/providers/github";
import { MockGitHubProvider } from "@/providers/mock";

export async function POST(request: Request) {
  try {
    const config = getConfig();
    const rawBody = await request.text();
    const provider =
      config.mode === "github" && config.github
        ? new GitHubProvider(config.github)
        : new MockGitHubProvider(config.appBaseUrl);
    const event = await provider.parseWebhook(request.headers, rawBody);
    getConnector().handleProviderEvent(event, "github");
    return Response.json({ ok: true, type: event.type });
  } catch (error) {
    return jsonError(error);
  }
}
