import type { AuditAction, AuditEvent } from "@/core/audit";
import { assertNever } from "@/core/assert-never";
import { hasExcessPermissions } from "@/core/policy";
import {
  assertValidClientId,
  ExcessivePermissionsError,
  InstallationNotApprovedError,
  InstallationNotBoundError,
  InstallationNotFoundError,
  InvalidInstallationTransitionError,
  type AccessibleRepo,
  type AccessToken,
  type ConnectorActor,
  type InstallationSnapshot,
  type InstallationStatus,
  type ProviderId,
  type RecordedInstallationStatus,
  type RepoConnector,
  type RequestInstallationInput,
  type RequestInstallationResult,
} from "@/core/types";
import type { InstallationRow, InstallationStore } from "@/db/store";
import type { GitProvider, ProviderEvent } from "@/providers/types";

export interface ConnectorDeps {
  store: InstallationStore;
  getProvider: (id: ProviderId) => GitProvider;
  signState: (clientId: string) => string;
  verifyState: (state: string) => string | null;
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
  hash: (value: string) => string;
  now?: () => Date;
}

export interface AdminInstallation {
  clientId: string;
  provider: ProviderId;
  status: RecordedInstallationStatus;
  accountLogin: string | null;
  accountType: string | null;
  permissions: Record<string, string>;
  permissionsExcess: boolean;
  bound: boolean;
  unbound: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CachedToken {
  token: string;
  expiresAt: Date;
  provider: ProviderId;
}

export class ConnectorService implements RepoConnector {
  private readonly tokenCache = new Map<string, CachedToken>();

  constructor(private readonly deps: ConnectorDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private isoNow(): string {
    return this.now().toISOString();
  }

  private audit(
    action: AuditAction,
    actor: string,
    clientId: string | null,
    detail?: string,
  ): void {
    this.deps.store.insertAudit({
      clientId,
      action,
      actor,
      detail: detail ?? null,
      createdAt: this.isoNow(),
    });
  }

  private requireRow(clientId: string): InstallationRow {
    const row = this.deps.store.getByClientId(clientId);
    if (!row) {
      throw new InstallationNotFoundError(clientId);
    }
    return row;
  }

  private parsePermissions(json: string): Record<string, string> {
    try {
      const value = JSON.parse(json) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, string>;
      }
    } catch {
      return {};
    }
    return {};
  }

  private toAdmin(row: InstallationRow): AdminInstallation {
    return {
      clientId: row.clientId,
      provider: row.provider,
      status: row.status,
      accountLogin: row.accountLogin,
      accountType: row.accountType,
      permissions: this.parsePermissions(row.permissionsJson),
      permissionsExcess: row.permissionsExcess === 1,
      bound: Boolean(row.installationRefEncrypted),
      unbound: row.unbound === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private writeRow(
    base: InstallationRow | undefined,
    patch: Partial<InstallationRow> & {
      clientId: string;
      provider: ProviderId;
      status: RecordedInstallationStatus;
    },
  ): void {
    this.deps.store.upsertInstallation(
      {
        clientId: patch.clientId,
        provider: patch.provider,
        status: patch.status,
        installationRefEncrypted:
          patch.installationRefEncrypted ??
          base?.installationRefEncrypted ??
          null,
        installationRefHash:
          patch.installationRefHash ?? base?.installationRefHash ?? null,
        accountLogin: patch.accountLogin ?? base?.accountLogin ?? null,
        accountType: patch.accountType ?? base?.accountType ?? null,
        permissionsJson: patch.permissionsJson ?? base?.permissionsJson ?? "{}",
        permissionsExcess:
          (patch.permissionsExcess ?? base?.permissionsExcess ?? 0) === 1,
        unbound: (patch.unbound ?? base?.unbound ?? 0) === 1,
      },
      this.isoNow(),
    );
  }

  async requestInstallation(
    input: RequestInstallationInput,
  ): Promise<RequestInstallationResult> {
    const clientId = input.clientId;
    assertValidClientId(clientId);
    const providerId: ProviderId = input.provider ?? "github";
    const provider = this.deps.getProvider(providerId);
    const now = this.isoNow();

    this.deps.store.upsertClient(clientId, providerId, now);
    const existing = this.deps.store.getByClientId(clientId);
    if (!existing) {
      this.deps.store.upsertInstallation(
        {
          clientId,
          provider: providerId,
          status: "pending",
          installationRefEncrypted: null,
          installationRefHash: null,
          accountLogin: null,
          accountType: null,
          permissionsJson: "{}",
          permissionsExcess: false,
          unbound: false,
        },
        now,
      );
    }

    this.audit("install_requested", "system", clientId, providerId);
    const state = this.deps.signState(clientId);
    return {
      clientId,
      provider: providerId,
      installUrl: provider.createInstallUrl(clientId, state),
      status: "pending",
    };
  }

  async getInstallationStatus(clientId: string): Promise<InstallationStatus> {
    assertValidClientId(clientId);
    const row = this.deps.store.getByClientId(clientId);
    return row ? row.status : "not_found";
  }

  async getInstallationSnapshot(
    clientId: string,
  ): Promise<InstallationSnapshot> {
    assertValidClientId(clientId);
    const row = this.deps.store.getByClientId(clientId);
    if (!row) {
      return {
        clientId,
        provider: "github",
        status: "not_found",
        accountLogin: null,
        permissionsExcess: false,
        bound: false,
      };
    }
    return {
      clientId: row.clientId,
      provider: row.provider,
      status: row.status,
      accountLogin: row.accountLogin,
      permissionsExcess: row.permissionsExcess === 1,
      bound: Boolean(row.installationRefEncrypted),
    };
  }

  async approveInstallation(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "approved" }> {
    assertValidClientId(clientId);
    const row = this.requireRow(clientId);
    if (row.status === "approved") {
      return { status: "approved" };
    }
    if (!row.installationRefEncrypted) {
      throw new InstallationNotBoundError(clientId);
    }
    if (
      row.status !== "pending" &&
      row.status !== "rejected" &&
      row.status !== "revoked"
    ) {
      throw new InvalidInstallationTransitionError(row.status, "approved");
    }
    this.writeRow(row, {
      clientId,
      provider: row.provider,
      status: "approved",
    });
    this.audit("approved", actor.actor, clientId);
    return { status: "approved" };
  }

  async rejectInstallation(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "rejected" }> {
    assertValidClientId(clientId);
    const row = this.requireRow(clientId);
    if (row.status === "rejected") {
      return { status: "rejected" };
    }
    if (row.status !== "pending" && row.status !== "approved") {
      throw new InvalidInstallationTransitionError(row.status, "rejected");
    }
    this.writeRow(row, {
      clientId,
      provider: row.provider,
      status: "rejected",
    });
    this.tokenCache.delete(clientId);
    this.audit("rejected", actor.actor, clientId);
    return { status: "rejected" };
  }

  async revokeAccess(
    clientId: string,
    actor: ConnectorActor,
  ): Promise<{ status: "revoked" }> {
    assertValidClientId(clientId);
    const row = this.requireRow(clientId);
    if (row.status === "revoked") {
      return { status: "revoked" };
    }
    if (
      row.status !== "pending" &&
      row.status !== "approved" &&
      row.status !== "rejected"
    ) {
      throw new InvalidInstallationTransitionError(row.status, "revoked");
    }
    this.writeRow(row, {
      clientId,
      provider: row.provider,
      status: "revoked",
    });
    this.tokenCache.delete(clientId);
    this.audit("revoked", actor.actor, clientId);
    return { status: "revoked" };
  }

  private assertUsable(row: InstallationRow): void {
    if (row.status !== "approved") {
      throw new InstallationNotApprovedError(row.status);
    }
    if (!row.installationRefEncrypted) {
      throw new InstallationNotBoundError(row.clientId);
    }
    if (row.permissionsExcess === 1) {
      throw new ExcessivePermissionsError();
    }
  }

  private installationRef(row: InstallationRow): string {
    if (!row.installationRefEncrypted) {
      throw new InstallationNotBoundError(row.clientId);
    }
    return this.deps.decrypt(row.installationRefEncrypted);
  }

  async getAccessToken(clientId: string): Promise<AccessToken> {
    assertValidClientId(clientId);
    const row = this.requireRow(clientId);
    this.assertUsable(row);

    const cached = this.tokenCache.get(clientId);
    const safetyWindowMs = 60_000;
    if (
      cached &&
      cached.expiresAt.getTime() - safetyWindowMs > this.now().getTime()
    ) {
      this.audit(
        "token_issued",
        "system",
        clientId,
        `cache:${this.deps.hash(cached.token).slice(0, 12)}`,
      );
      return {
        token: cached.token,
        tokenType: "installation",
        provider: row.provider,
        expiresAt: cached.expiresAt.toISOString(),
      };
    }

    const provider = this.deps.getProvider(row.provider);
    const minted = await provider.createInstallationToken(
      this.installationRef(row),
    );
    this.tokenCache.set(clientId, {
      token: minted.token,
      expiresAt: minted.expiresAt,
      provider: row.provider,
    });
    this.audit(
      "token_issued",
      "system",
      clientId,
      this.deps.hash(minted.token).slice(0, 12),
    );
    return {
      token: minted.token,
      tokenType: "installation",
      provider: row.provider,
      expiresAt: minted.expiresAt.toISOString(),
    };
  }

  async listAccessibleRepos(clientId: string): Promise<AccessibleRepo[]> {
    assertValidClientId(clientId);
    const token = await this.getAccessToken(clientId);
    const provider = this.deps.getProvider(token.provider);
    const repos = await provider.listRepos(token.token);
    this.audit("repos_listed", "system", clientId, String(repos.length));
    return repos;
  }

  bindInstallation(input: {
    clientId: string;
    installationRef: string;
    accountLogin: string | null;
    accountType: string | null;
    permissions: Record<string, string>;
    actor: string;
  }): void {
    assertValidClientId(input.clientId);
    const now = this.isoNow();
    this.deps.store.upsertClient(input.clientId, "github", now);

    const hash = this.deps.hash(input.installationRef);
    const existingByHash = this.deps.store.getByInstallationHash(hash);
    if (
      existingByHash &&
      existingByHash.clientId !== input.clientId &&
      existingByHash.unbound === 1
    ) {
      this.deps.store.deleteInstallation(existingByHash.clientId);
    }

    const existing = this.deps.store.getByClientId(input.clientId);
    let status: RecordedInstallationStatus = existing?.status ?? "pending";
    if (status === "revoked") {
      status = "pending";
    }

    const excess = hasExcessPermissions(input.permissions);
    this.deps.store.upsertInstallation(
      {
        clientId: input.clientId,
        provider: existing?.provider ?? "github",
        status,
        installationRefEncrypted: this.deps.encrypt(input.installationRef),
        installationRefHash: hash,
        accountLogin: input.accountLogin,
        accountType: input.accountType,
        permissionsJson: JSON.stringify(input.permissions),
        permissionsExcess: excess,
        unbound: false,
      },
      now,
    );
    this.audit(
      "installation_bound",
      input.actor,
      input.clientId,
      input.accountLogin ?? input.installationRef,
    );
    if (excess) {
      this.audit("permissions_flagged", input.actor, input.clientId);
    }
  }

  bindFromCallback(state: string, installationRef: string): string {
    const clientId = this.deps.verifyState(state);
    if (!clientId) {
      throw new Error("Install callback state is invalid or tampered.");
    }
    this.bindInstallation({
      clientId,
      installationRef,
      accountLogin: null,
      accountType: null,
      permissions: {},
      actor: "install-callback",
    });
    return clientId;
  }

  async refreshPermissions(clientId: string): Promise<void> {
    const row = this.requireRow(clientId);
    if (!row.installationRefEncrypted) {
      return;
    }
    const provider = this.deps.getProvider(row.provider);
    const permissions = await provider.readPermissions(
      this.installationRef(row),
    );
    const excess = hasExcessPermissions(permissions);
    this.writeRow(row, {
      clientId,
      provider: row.provider,
      status: row.status,
      permissionsJson: JSON.stringify(permissions),
      permissionsExcess: excess ? 1 : 0,
    });
    if (excess) {
      this.audit("permissions_flagged", "system", clientId);
    }
  }

  handleProviderEvent(event: ProviderEvent, providerId: ProviderId): void {
    switch (event.type) {
      case "ignored":
        return;
      case "installation_created": {
        const clientIdFromState = event.state
          ? this.deps.verifyState(event.state)
          : null;
        if (clientIdFromState) {
          this.bindInstallation({
            clientId: clientIdFromState,
            installationRef: event.installationRef,
            accountLogin: event.accountLogin,
            accountType: event.accountType,
            permissions: event.permissions,
            actor: `${providerId}-webhook`,
          });
          return;
        }
        const hash = this.deps.hash(event.installationRef);
        const existing = this.deps.store.getByInstallationHash(hash);
        if (existing) {
          const excess = hasExcessPermissions(event.permissions);
          this.writeRow(existing, {
            clientId: existing.clientId,
            provider: existing.provider,
            status:
              existing.status === "revoked" ? "pending" : existing.status,
            accountLogin: event.accountLogin,
            accountType: event.accountType,
            permissionsJson: JSON.stringify(event.permissions),
            permissionsExcess: excess ? 1 : 0,
          });
          this.audit(
            "installation_bound",
            `${providerId}-webhook`,
            existing.clientId,
            event.accountLogin ?? event.installationRef,
          );
          if (excess) {
            this.audit(
              "permissions_flagged",
              `${providerId}-webhook`,
              existing.clientId,
            );
          }
          return;
        }
        const unboundId = `unbound:${hash.slice(0, 12)}`;
        const now = this.isoNow();
        this.deps.store.upsertClient(unboundId, providerId, now);
        this.deps.store.upsertInstallation(
          {
            clientId: unboundId,
            provider: providerId,
            status: "pending",
            installationRefEncrypted: this.deps.encrypt(event.installationRef),
            installationRefHash: hash,
            accountLogin: event.accountLogin,
            accountType: event.accountType,
            permissionsJson: JSON.stringify(event.permissions),
            permissionsExcess: hasExcessPermissions(event.permissions),
            unbound: true,
          },
          now,
        );
        this.audit(
          "unbound_installation_received",
          `${providerId}-webhook`,
          unboundId,
          event.accountLogin ?? undefined,
        );
        return;
      }
      case "installation_deleted": {
        const row = this.deps.store.getByInstallationHash(
          this.deps.hash(event.installationRef),
        );
        if (!row) {
          return;
        }
        this.writeRow(row, {
          clientId: row.clientId,
          provider: row.provider,
          status: "revoked",
        });
        this.tokenCache.delete(row.clientId);
        this.audit("provider_uninstalled", `${providerId}-webhook`, row.clientId);
        return;
      }
      case "installation_suspended": {
        const row = this.deps.store.getByInstallationHash(
          this.deps.hash(event.installationRef),
        );
        if (!row) {
          return;
        }
        this.writeRow(row, {
          clientId: row.clientId,
          provider: row.provider,
          status: "revoked",
        });
        this.tokenCache.delete(row.clientId);
        this.audit("provider_suspended", `${providerId}-webhook`, row.clientId);
        return;
      }
      case "installation_unsuspended": {
        const row = this.deps.store.getByInstallationHash(
          this.deps.hash(event.installationRef),
        );
        if (!row) {
          return;
        }
        this.writeRow(row, {
          clientId: row.clientId,
          provider: row.provider,
          status: "pending",
        });
        this.tokenCache.delete(row.clientId);
        this.audit(
          "installation_bound",
          `${providerId}-webhook`,
          row.clientId,
          "unsuspended; re-approval required",
        );
        return;
      }
      default:
        assertNever(event);
    }
  }

  completeMockInstall(clientId: string): void {
    assertValidClientId(clientId);
    this.bindInstallation({
      clientId,
      installationRef: `mock-${clientId}`,
      accountLogin: `mock-${clientId.slice(0, 8)}`,
      accountType: "User",
      permissions: { contents: "read", metadata: "read" },
      actor: "github-mock",
    });
  }

  listInstallations(): AdminInstallation[] {
    return this.deps.store.listAll().map((row) => this.toAdmin(row));
  }

  listAuditEvents(clientId?: string): AuditEvent[] {
    return this.deps.store.listAudit(clientId);
  }
}

export function createConnector(deps: ConnectorDeps): ConnectorService {
  return new ConnectorService(deps);
}
