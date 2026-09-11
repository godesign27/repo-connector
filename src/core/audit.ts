export type AuditAction =
  | "install_requested"
  | "installation_bound"
  | "unbound_installation_received"
  | "approved"
  | "rejected"
  | "revoked"
  | "token_issued"
  | "repos_listed"
  | "permissions_flagged"
  | "provider_uninstalled"
  | "provider_suspended";

export interface AuditEvent {
  id: number;
  clientId: string | null;
  action: AuditAction;
  actor: string;
  detail: string | null;
  createdAt: string;
}
