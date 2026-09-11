export type ProviderId = "github";

export type InstallationStatus =
  | "not_found"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export type RecordedInstallationStatus = Exclude<
  InstallationStatus,
  "not_found"
>;

export interface RequestInstallationInput {
  clientId: string;
  provider?: ProviderId;
}

export interface RequestInstallationResult {
  clientId: string;
  provider: ProviderId;
  installUrl: string;
  status: "pending";
}

export interface AccessToken {
  token: string;
  tokenType: "installation";
  provider: ProviderId;
  expiresAt: string;
}

export interface AccessibleRepo {
  id: string;
  fullName: string;
  defaultBranch: string | null;
  private: boolean;
}

export interface ConnectorActor {
  actor: string;
}

export interface InstallationSnapshot {
  clientId: string;
  provider: ProviderId;
  status: InstallationStatus;
  accountLogin: string | null;
  permissionsExcess: boolean;
  bound: boolean;
}

export class InstallationNotApprovedError extends Error {
  readonly status: Exclude<InstallationStatus, "approved">;
  readonly code = "INSTALLATION_NOT_APPROVED";

  constructor(status: Exclude<InstallationStatus, "approved">) {
    super(
      `Installation is '${status}'. getAccessToken and listAccessibleRepos require status 'approved'.`,
    );
    this.name = "InstallationNotApprovedError";
    this.status = status;
  }
}

export class ExcessivePermissionsError extends Error {
  readonly code = "EXCESSIVE_PERMISSIONS";

  constructor(message = "Installation grants permissions beyond contents:read and metadata:read.") {
    super(message);
    this.name = "ExcessivePermissionsError";
  }
}

export class InstallationNotFoundError extends Error {
  readonly code = "INSTALLATION_NOT_FOUND";

  constructor(clientId: string) {
    super(`No installation found for client '${clientId}'.`);
    this.name = "InstallationNotFoundError";
  }
}

export class InstallationNotBoundError extends Error {
  readonly code = "INSTALLATION_NOT_BOUND";

  constructor(clientId: string) {
    super(
      `Client '${clientId}' has not completed the Git provider install, so it cannot be approved or used.`,
    );
    this.name = "InstallationNotBoundError";
  }
}

export class InvalidInstallationTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";

  constructor(from: InstallationStatus, to: RecordedInstallationStatus) {
    super(`Cannot move installation from '${from}' to '${to}'.`);
    this.name = "InvalidInstallationTransitionError";
  }
}

export class InvalidClientIdError extends Error {
  readonly code = "INVALID_CLIENT_ID";

  constructor(clientId: string) {
    super(
      `Invalid clientId '${clientId}'. Use 1–128 characters: letters, numbers, '.', '_', '-', ':'.`,
    );
    this.name = "InvalidClientIdError";
  }
}

export interface RepoConnector {
  requestInstallation(
    input: RequestInstallationInput,
  ): Promise<RequestInstallationResult>;
  getInstallationStatus(clientId: string): Promise<InstallationStatus>;
  approveInstallation(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "approved" }>;
  rejectInstallation(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "rejected" }>;
  revokeAccess(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "revoked" }>;
  getAccessToken(clientId: string): Promise<AccessToken>;
  listAccessibleRepos(clientId: string): Promise<AccessibleRepo[]>;
}

export const CLIENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function assertValidClientId(clientId: string): void {
  if (!CLIENT_ID_PATTERN.test(clientId) || clientId.startsWith("unbound:")) {
    throw new InvalidClientIdError(clientId);
  }
}
