import { afterEach, describe, expect, it } from "vitest";
import { createConnector, type ConnectorService } from "@/core/connector";
import {
  ExcessivePermissionsError,
  InstallationNotApprovedError,
  InstallationNotFoundError,
} from "@/core/types";
import { decrypt, encrypt, sha256Hex, signState, verifyState } from "@/db/crypto";
import { InstallationStore } from "@/db/store";
import { MockGitHubProvider } from "@/providers/mock";

const SECRET = "test-encryption-key";

function makeConnector(): { connector: ConnectorService; store: InstallationStore } {
  const store = new InstallationStore(":memory:");
  const provider = new MockGitHubProvider("http://127.0.0.1:43127");
  const connector = createConnector({
    store,
    getProvider: () => provider,
    signState: (clientId) => signState(SECRET, clientId),
    verifyState: (state) => verifyState(SECRET, state),
    encrypt: (value) => encrypt(value, SECRET),
    decrypt: (value) => decrypt(value, SECRET),
    hash: sha256Hex,
  });
  return { connector, store };
}

describe("ConnectorService approval gate", () => {
  let store: InstallationStore | undefined;

  afterEach(() => {
    store?.close();
  });

  it("returns not_found before requestInstallation", async () => {
    const created = makeConnector();
    store = created.store;
    await expect(
      created.connector.getInstallationStatus("docent-1"),
    ).resolves.toBe("not_found");
  });

  it("creates a pending install and refuses tokens until approved", async () => {
    const { connector, store: db } = makeConnector();
    store = db;
    const requested = await connector.requestInstallation({
      clientId: "docent-1",
    });
    expect(requested.status).toBe("pending");
    expect(requested.installUrl).toContain("/install/callback");
    await expect(connector.getInstallationStatus("docent-1")).resolves.toBe(
      "pending",
    );
    await expect(connector.getAccessToken("docent-1")).rejects.toBeInstanceOf(
      InstallationNotApprovedError,
    );

    connector.completeMockInstall("docent-1");
    await expect(connector.getAccessToken("docent-1")).rejects.toBeInstanceOf(
      InstallationNotApprovedError,
    );
    await expect(connector.listAccessibleRepos("docent-1")).rejects.toBeInstanceOf(
      InstallationNotApprovedError,
    );

    await connector.approveInstallation("docent-1", { actor: "admin" });
    const token = await connector.getAccessToken("docent-1");
    expect(token.tokenType).toBe("installation");
    expect(token.token.startsWith("mock-install-token.")).toBe(true);
    expect(Date.parse(token.expiresAt)).toBeGreaterThan(Date.now());

    const repos = await connector.listAccessibleRepos("docent-1");
    expect(repos.map((repo) => repo.fullName)).toEqual([
      "acme/design-system",
      "acme/docs",
    ]);
  });

  it("blocks tokens after reject and restores them after re-approve", async () => {
    const { connector, store: db } = makeConnector();
    store = db;
    await connector.requestInstallation({ clientId: "docent-2" });
    connector.completeMockInstall("docent-2");
    await connector.approveInstallation("docent-2", { actor: "admin" });
    await connector.rejectInstallation("docent-2", { actor: "admin" });
    await expect(connector.getInstallationStatus("docent-2")).resolves.toBe(
      "rejected",
    );
    await expect(connector.getAccessToken("docent-2")).rejects.toMatchObject({
      status: "rejected",
    });
    await connector.approveInstallation("docent-2", { actor: "admin" });
    await expect(connector.getAccessToken("docent-2")).resolves.toMatchObject({
      tokenType: "installation",
    });
  });

  it("revokes tokens and allows re-approval without a new install", async () => {
    const { connector, store: db } = makeConnector();
    store = db;
    await connector.requestInstallation({ clientId: "docent-3" });
    connector.completeMockInstall("docent-3");
    await connector.approveInstallation("docent-3", { actor: "admin" });
    await connector.revokeAccess("docent-3", { actor: "admin" });
    await expect(connector.getAccessToken("docent-3")).rejects.toMatchObject({
      status: "revoked",
    });
    await connector.approveInstallation("docent-3", { actor: "admin" });
    await expect(connector.getAccessToken("docent-3")).resolves.toBeTruthy();
  });

  it("returns a new install to pending after a provider uninstall plus reinstall", async () => {
    const { connector, store: db } = makeConnector();
    store = db;
    await connector.requestInstallation({ clientId: "docent-4" });
    connector.completeMockInstall("docent-4");
    await connector.approveInstallation("docent-4", { actor: "admin" });
    connector.handleProviderEvent(
      { type: "installation_deleted", installationRef: "mock-docent-4" },
      "github",
    );
    await expect(connector.getInstallationStatus("docent-4")).resolves.toBe(
      "revoked",
    );
    connector.handleProviderEvent(
      {
        type: "installation_created",
        installationRef: "mock-docent-4-b",
        accountLogin: "acme",
        accountType: "Organization",
        permissions: { contents: "read", metadata: "read" },
        state: signState(SECRET, "docent-4"),
      },
      "github",
    );
    await expect(connector.getInstallationStatus("docent-4")).resolves.toBe(
      "pending",
    );
  });

  it("blocks token issuance when permissions exceed the read-only policy", async () => {
    const { connector, store: db } = makeConnector();
    store = db;
    await connector.requestInstallation({ clientId: "docent-5" });
    connector.bindInstallation({
      clientId: "docent-5",
      installationRef: "wide-1",
      accountLogin: "acme",
      accountType: "Organization",
      permissions: { contents: "write", metadata: "read", administration: "write" },
      actor: "test",
    });
    await connector.approveInstallation("docent-5", { actor: "admin" });
    await expect(connector.getAccessToken("docent-5")).rejects.toBeInstanceOf(
      ExcessivePermissionsError,
    );
  });

  it("writes audit events for request, bind, approve, token, and revoke", async () => {
    const { connector, store: db } = makeConnector();
    store = db;
    await connector.requestInstallation({ clientId: "docent-6" });
    connector.completeMockInstall("docent-6");
    await connector.approveInstallation("docent-6", { actor: "admin" });
    await connector.getAccessToken("docent-6");
    await connector.revokeAccess("docent-6", { actor: "admin" });
    const actions = connector.listAuditEvents("docent-6").map((event) => event.action);
    expect(actions).toContain("install_requested");
    expect(actions).toContain("installation_bound");
    expect(actions).toContain("approved");
    expect(actions).toContain("token_issued");
    expect(actions).toContain("revoked");
    const tokenEvent = connector
      .listAuditEvents("docent-6")
      .find((event) => event.action === "token_issued");
    expect(tokenEvent?.detail).toBeTruthy();
    expect(tokenEvent?.detail?.includes("mock-install-token")).toBe(false);
  });

  it("throws not found for unknown clients on mutating calls", async () => {
    const { connector, store: db } = makeConnector();
    store = db;
    await expect(
      connector.approveInstallation("missing", { actor: "admin" }),
    ).rejects.toBeInstanceOf(InstallationNotFoundError);
  });
});
