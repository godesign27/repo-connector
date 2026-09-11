import type { AccessibleRepo, ProviderId } from "@/core/types";

export type ProviderEvent =
  | {
      type: "installation_created";
      installationRef: string;
      accountLogin: string | null;
      accountType: string | null;
      permissions: Record<string, string>;
      state: string | null;
    }
  | {
      type: "installation_deleted";
      installationRef: string;
    }
  | {
      type: "installation_suspended";
      installationRef: string;
    }
  | {
      type: "installation_unsuspended";
      installationRef: string;
    }
  | {
      type: "ignored";
      reason: string;
    };

export interface GitProvider {
  readonly id: ProviderId;
  createInstallUrl(clientId: string, state: string): string;
  parseWebhook(headers: Headers, rawBody: string): Promise<ProviderEvent>;
  createInstallationToken(
    installationRef: string,
  ): Promise<{ token: string; expiresAt: Date }>;
  listRepos(installationToken: string): Promise<AccessibleRepo[]>;
  readPermissions(installationRef: string): Promise<Record<string, string>>;
}
