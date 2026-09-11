import {
  ExcessivePermissionsError,
  InstallationNotApprovedError,
  InstallationNotBoundError,
  InstallationNotFoundError,
  InvalidClientIdError,
  InvalidInstallationTransitionError,
  type AccessibleRepo,
  type AccessToken,
  type ConnectorActor,
  type InstallationSnapshot,
  type InstallationStatus,
  type RepoConnector,
  type RequestInstallationInput,
  type RequestInstallationResult,
} from "@/core/types";

export interface RepoConnectorClientOptions {
  baseUrl: string;
  apiKey: string;
  actor?: string;
  fetch?: typeof fetch;
}

export class RepoConnectorClient implements RepoConnector {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: RepoConnectorClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.options.apiKey}`);
    headers.set("Accept", "application/json");
    if (this.options.actor) {
      headers.set("X-Actor", this.options.actor);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await this.fetchImpl(
      `${this.options.baseUrl.replace(/\/$/, "")}${path}`,
      { ...init, headers },
    );
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      status?: InstallationStatus;
    };
    if (!response.ok) {
      throw mapClientError(body, response.status);
    }
    return body as T;
  }

  async requestInstallation(
    input: RequestInstallationInput,
  ): Promise<RequestInstallationResult> {
    return this.request(`/v1/installations/${encodeURIComponent(input.clientId)}/request`, {
      method: "POST",
      body: JSON.stringify({ provider: input.provider ?? "github" }),
    });
  }

  async getInstallationStatus(clientId: string): Promise<InstallationStatus> {
    const snapshot = await this.getInstallationSnapshot(clientId);
    return snapshot.status;
  }

  async getInstallationSnapshot(clientId: string): Promise<InstallationSnapshot> {
    return this.request(`/v1/installations/${encodeURIComponent(clientId)}`);
  }

  async approveInstallation(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "approved" }> {
    return this.request(
      `/v1/installations/${encodeURIComponent(clientId)}/approve`,
      {
        method: "POST",
        headers: { "X-Actor": actor.actor },
      },
    );
  }

  async rejectInstallation(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "rejected" }> {
    return this.request(
      `/v1/installations/${encodeURIComponent(clientId)}/reject`,
      {
        method: "POST",
        headers: { "X-Actor": actor.actor },
      },
    );
  }

  async revokeAccess(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "revoked" }> {
    return this.request(
      `/v1/installations/${encodeURIComponent(clientId)}/revoke`,
      {
        method: "POST",
        headers: { "X-Actor": actor.actor },
      },
    );
  }

  async getAccessToken(clientId: string): Promise<AccessToken> {
    return this.request(`/v1/installations/${encodeURIComponent(clientId)}/token`);
  }

  async listAccessibleRepos(clientId: string): Promise<AccessibleRepo[]> {
    const body = await this.request<{ repos: AccessibleRepo[] }>(
      `/v1/installations/${encodeURIComponent(clientId)}/repos`,
    );
    return body.repos;
  }
}

function mapClientError(
  body: { error?: string; message?: string; status?: InstallationStatus },
  httpStatus: number,
): Error {
  const message = body.message ?? `Request failed (${httpStatus})`;
  switch (body.error) {
    case "INSTALLATION_NOT_FOUND":
      return new InstallationNotFoundError("unknown");
    case "INSTALLATION_NOT_APPROVED":
      return new InstallationNotApprovedError(
        body.status && body.status !== "approved" ? body.status : "pending",
      );
    case "EXCESSIVE_PERMISSIONS":
      return new ExcessivePermissionsError(message);
    case "INSTALLATION_NOT_BOUND":
      return new InstallationNotBoundError("unknown");
    case "INVALID_CLIENT_ID":
      return new InvalidClientIdError("unknown");
    case "INVALID_TRANSITION":
      return new InvalidInstallationTransitionError("pending", "approved");
    default:
      return new Error(message);
  }
}
