import type { AccessibleRepo } from "@/core/types";
import type { GitProvider, ProviderEvent } from "@/providers/types";

export class MockGitHubProvider implements GitProvider {
  readonly id = "github" as const;

  constructor(private readonly baseUrl: string) {}

  createInstallUrl(clientId: string, state: string): string {
    const url = new URL("/install/callback", this.baseUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("installation_id", `mock-${clientId}`);
    url.searchParams.set("setup_action", "install");
    return url.toString();
  }

  async parseWebhook(headers: Headers, rawBody: string): Promise<ProviderEvent> {
    const secret = headers.get("x-mock-secret");
    if (secret !== "mock") {
      throw new Error("Invalid mock webhook secret");
    }
    return JSON.parse(rawBody) as ProviderEvent;
  }

  async createInstallationToken(
    installationRef: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    return {
      token: `mock-install-token.${installationRef}.${expiresAt.getTime()}`,
      expiresAt,
    };
  }

  async listRepos(installationToken: string): Promise<AccessibleRepo[]> {
    void installationToken;
    return [
      {
        id: "1001",
        fullName: "acme/design-system",
        defaultBranch: "main",
        private: true,
      },
      {
        id: "1002",
        fullName: "acme/docs",
        defaultBranch: "main",
        private: false,
      },
    ];
  }

  async readPermissions(
    installationRef: string,
  ): Promise<Record<string, string>> {
    void installationRef;
    return { contents: "read", metadata: "read" };
  }
}
