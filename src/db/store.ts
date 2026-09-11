import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { AuditAction, AuditEvent } from "@/core/audit";
import type { ProviderId, RecordedInstallationStatus } from "@/core/types";

export interface InstallationRow {
  clientId: string;
  provider: ProviderId;
  status: RecordedInstallationStatus;
  installationRefEncrypted: string | null;
  installationRefHash: string | null;
  accountLogin: string | null;
  accountType: string | null;
  permissionsJson: string;
  permissionsExcess: number;
  unbound: number;
  createdAt: string;
  updatedAt: string;
}

export interface InstallationWrite {
  clientId: string;
  provider: ProviderId;
  status: RecordedInstallationStatus;
  installationRefEncrypted: string | null;
  installationRefHash: string | null;
  accountLogin: string | null;
  accountType: string | null;
  permissionsJson: string;
  permissionsExcess: boolean;
  unbound: boolean;
}

interface InstallationSqlRow {
  client_id: string;
  provider: ProviderId;
  status: RecordedInstallationStatus;
  installation_ref_encrypted: string | null;
  installation_ref_hash: string | null;
  account_login: string | null;
  account_type: string | null;
  permissions_json: string;
  permissions_excess: number;
  unbound: number;
  created_at: string;
  updated_at: string;
}

interface AuditSqlRow {
  id: number;
  client_id: string | null;
  action: AuditAction;
  actor: string;
  detail: string | null;
  created_at: string;
}

function mapInstallation(row: InstallationSqlRow): InstallationRow {
  return {
    clientId: row.client_id,
    provider: row.provider,
    status: row.status,
    installationRefEncrypted: row.installation_ref_encrypted,
    installationRefHash: row.installation_ref_hash,
    accountLogin: row.account_login,
    accountType: row.account_type,
    permissionsJson: row.permissions_json,
    permissionsExcess: row.permissions_excess,
    unbound: row.unbound,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class InstallationStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        client_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS installations (
        client_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        installation_ref_encrypted TEXT,
        installation_ref_hash TEXT,
        account_login TEXT,
        account_type TEXT,
        permissions_json TEXT NOT NULL DEFAULT '{}',
        permissions_excess INTEGER NOT NULL DEFAULT 0,
        unbound INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS installations_ref_hash
        ON installations(installation_ref_hash)
        WHERE installation_ref_hash IS NOT NULL;

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  upsertClient(
    clientId: string,
    provider: ProviderId,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO clients (client_id, provider, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(client_id) DO NOTHING`,
      )
      .run(clientId, provider, createdAt);
  }

  getByClientId(clientId: string): InstallationRow | undefined {
    const row = this.db
      .prepare(`SELECT * FROM installations WHERE client_id = ?`)
      .get(clientId) as InstallationSqlRow | undefined;
    return row ? mapInstallation(row) : undefined;
  }

  getByInstallationHash(hash: string): InstallationRow | undefined {
    const row = this.db
      .prepare(`SELECT * FROM installations WHERE installation_ref_hash = ?`)
      .get(hash) as InstallationSqlRow | undefined;
    return row ? mapInstallation(row) : undefined;
  }

  listAll(): InstallationRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM installations ORDER BY updated_at DESC`)
      .all() as InstallationSqlRow[];
    return rows.map(mapInstallation);
  }

  upsertInstallation(write: InstallationWrite, now: string): void {
    const existing = this.getByClientId(write.clientId);
    const createdAt = existing?.createdAt ?? now;
    this.db
      .prepare(
        `INSERT INTO installations (
           client_id, provider, status, installation_ref_encrypted,
           installation_ref_hash, account_login, account_type,
           permissions_json, permissions_excess, unbound, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET
           provider = excluded.provider,
           status = excluded.status,
           installation_ref_encrypted = excluded.installation_ref_encrypted,
           installation_ref_hash = excluded.installation_ref_hash,
           account_login = excluded.account_login,
           account_type = excluded.account_type,
           permissions_json = excluded.permissions_json,
           permissions_excess = excluded.permissions_excess,
           unbound = excluded.unbound,
           updated_at = excluded.updated_at`,
      )
      .run(
        write.clientId,
        write.provider,
        write.status,
        write.installationRefEncrypted,
        write.installationRefHash,
        write.accountLogin,
        write.accountType,
        write.permissionsJson,
        write.permissionsExcess ? 1 : 0,
        write.unbound ? 1 : 0,
        createdAt,
        now,
      );
  }

  deleteInstallation(clientId: string): void {
    this.db
      .prepare(`DELETE FROM installations WHERE client_id = ?`)
      .run(clientId);
    this.db.prepare(`DELETE FROM clients WHERE client_id = ?`).run(clientId);
  }

  insertAudit(event: {
    clientId: string | null;
    action: AuditAction;
    actor: string;
    detail: string | null;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_events (client_id, action, actor, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        event.clientId,
        event.action,
        event.actor,
        event.detail,
        event.createdAt,
      );
  }

  listAudit(clientId?: string, limit = 100): AuditEvent[] {
    const rows = (
      clientId
        ? this.db
            .prepare(
              `SELECT * FROM audit_events
               WHERE client_id = ?
               ORDER BY id DESC
               LIMIT ?`,
            )
            .all(clientId, limit)
        : this.db
            .prepare(`SELECT * FROM audit_events ORDER BY id DESC LIMIT ?`)
            .all(limit)
    ) as AuditSqlRow[];

    return rows.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      action: row.action,
      actor: row.actor,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }
}
