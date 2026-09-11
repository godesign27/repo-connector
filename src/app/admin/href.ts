export type AdminView = "queue" | "audit";
export type StatusFilter =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked"
  | "all";
export type AuditScope = "selected" | "all";

export interface AdminQuery {
  view: AdminView;
  status: StatusFilter;
  auditScope: AuditScope;
  clientId?: string;
  installUrl?: string;
}

export function parseAdminQuery(params: {
  view?: string;
  status?: string;
  auditScope?: string;
  clientId?: string;
  installUrl?: string;
}): AdminQuery {
  const view: AdminView = params.view === "audit" ? "audit" : "queue";
  const status = parseStatus(params.status);
  const auditScope: AuditScope =
    params.auditScope === "selected" ? "selected" : "all";
  return {
    view,
    status,
    auditScope,
    clientId: params.clientId,
    installUrl: params.installUrl,
  };
}

function parseStatus(value: string | undefined): StatusFilter {
  switch (value) {
    case "pending":
    case "approved":
    case "rejected":
    case "revoked":
    case "all":
      return value;
    default:
      return "pending";
  }
}

export function adminHref(query: AdminQuery): string {
  const params = new URLSearchParams();
  params.set("view", query.view);
  params.set("status", query.status);
  params.set("auditScope", query.auditScope);
  if (query.clientId) {
    params.set("clientId", query.clientId);
  }
  if (query.installUrl) {
    params.set("installUrl", query.installUrl);
  }
  return `/admin?${params.toString()}`;
}
