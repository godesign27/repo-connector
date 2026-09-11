import { createHmac, timingSafeEqual } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import type { AccessibleRepo } from "@/core/types";
import type { GitProvider, ProviderEvent } from "@/providers/types";

export interface GitHubProviderConfig {
  appId: string;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  apiBase?: string;
}

interface GitHubInstallationPayload {
  action?: string;
  installation?: {
    id?: number | string;
    account?: { login?: string; type?: string };
    permissions?: Record<string, string>;
  };
}

export class GitHubProvider implements GitProvider {
  readonly id = "github" as const;
  private readonly apiBase: string;

  constructor(private readonly config: GitHubProviderConfig) {
    this.apiBase = config.apiBase ?? "https://api.github.com";
  }

  createInstallUrl(clientId: string, state: string): string {
    void clientId;
    const url = new URL(
      `https://github.com/apps/${this.config.appSlug}/installations/new`,
    );
    url.searchParams.set("state", state);
    return url.toString();
  }

  async parseWebhook(headers: Headers, rawBody: string): Promise<ProviderEvent> {
    this.verifySignature(headers.get("x-hub-signature-256"), rawBody);
    const eventName = headers.get("x-github-event") ?? "";
    const payload = JSON.parse(rawBody) as GitHubInstallationPayload;

    if (eventName !== "installation") {
      return { type: "ignored", reason: `event:${eventName}` };
    }

    const installationRef = payload.installation?.id
      ? String(payload.installation.id)
      : null;
    if (!installationRef) {
      return { type: "ignored", reason: "missing installation id" };
    }

    const action = payload.action ?? "";
    switch (action) {
      case "created":
        return {
          type: "installation_created",
          installationRef,
          accountLogin: payload.installation?.account?.login ?? null,
          accountType: payload.installation?.account?.type ?? null,
          permissions: payload.installation?.permissions ?? {},
          state: null,
        };
      case "deleted":
        return { type: "installation_deleted", installationRef };
      case "suspend":
        return { type: "installation_suspended", installationRef };
      case "unsuspend":
        return { type: "installation_unsuspended", installationRef };
      default:
        return { type: "ignored", reason: `action:${action}` };
    }
  }

  async createInstallationToken(
    installationRef: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const jwt = await this.appJwt();
    const response = await fetch(
      `${this.apiBase}/app/installations/${installationRef}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub token mint failed (${response.status}): ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      token: string;
      expires_at: string;
    };
    return { token: body.token, expiresAt: new Date(body.expires_at) };
  }

  async listRepos(installationToken: string): Promise<AccessibleRepo[]> {
    const repos: AccessibleRepo[] = [];
    let page = 1;
    while (page <= 20) {
      const response = await fetch(
        `${this.apiBase}/installation/repositories?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${installationToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (!response.ok) {
        throw new Error(
          `GitHub repo list failed (${response.status}): ${await response.text()}`,
        );
      }
      const body = (await response.json()) as {
        repositories?: Array<{
          id: number;
          full_name: string;
          default_branch?: string;
          private: boolean;
        }>;
      };
      const batch = body.repositories ?? [];
      for (const repo of batch) {
        repos.push({
          id: String(repo.id),
          fullName: repo.full_name,
          defaultBranch: repo.default_branch ?? null,
          private: repo.private,
        });
      }
      if (batch.length < 100) {
        break;
      }
      page += 1;
    }
    return repos;
  }

  async readPermissions(
    installationRef: string,
  ): Promise<Record<string, string>> {
    const jwt = await this.appJwt();
    const response = await fetch(
      `${this.apiBase}/app/installations/${installationRef}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub installation read failed (${response.status}): ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      permissions?: Record<string, string>;
    };
    return body.permissions ?? {};
  }

  private verifySignature(header: string | null, rawBody: string): void {
    if (!header || !header.startsWith("sha256=")) {
      throw new Error("Missing GitHub webhook signature");
    }
    const expected =
      "sha256=" +
      createHmac("sha256", this.config.webhookSecret)
        .update(rawBody)
        .digest("hex");
    const left = Buffer.from(header);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new Error("Invalid GitHub webhook signature");
    }
  }

  private async appJwt(): Promise<string> {
    const pem = this.config.privateKey.replace(/\\n/g, "\n");
    const key = await importPKCS8(pem, "RS256");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt(now - 30)
      .setExpirationTime(now + 9 * 60)
      .setIssuer(this.config.appId)
      .sign(key);
  }
}
