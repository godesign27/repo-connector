import Link from "next/link";
import {
  approveAction,
  completeMockInstallAction,
  logoutAction,
  rejectAction,
  requestInstallAction,
  revokeAction,
} from "@/app/admin/actions";
import {
  adminHref,
  parseAdminQuery,
  type AdminQuery,
  type StatusFilter,
} from "@/app/admin/href";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditAction, AuditEvent } from "@/core/audit";
import { assertNever } from "@/core/assert-never";
import type { AdminInstallation } from "@/core/connector";
import type { RecordedInstallationStatus } from "@/core/types";
import { cn } from "@/lib/utils";
import { getConfig, getConnector } from "@/lib/server-connector";

function statusVariant(
  status: RecordedInstallationStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pending":
      return "outline";
    case "approved":
      return "default";
    case "rejected":
      return "secondary";
    case "revoked":
      return "destructive";
    default:
      return assertNever(status);
  }
}

function auditLabel(action: AuditAction): string {
  switch (action) {
    case "install_requested":
      return "Install requested";
    case "installation_bound":
      return "GitHub connected";
    case "unbound_installation_received":
      return "Unmatched GitHub install";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "revoked":
      return "Revoked";
    case "token_issued":
      return "Token issued";
    case "repos_listed":
      return "Repos listed";
    case "permissions_flagged":
      return "Permissions too broad";
    case "provider_uninstalled":
      return "GitHub uninstalled";
    case "provider_suspended":
      return "GitHub suspended";
    default:
      return assertNever(action);
  }
}

function countByStatus(
  rows: AdminInstallation[],
  status: StatusFilter,
): number {
  if (status === "all") {
    return rows.length;
  }
  return rows.filter((row) => row.status === status).length;
}

function filterInstallations(
  rows: AdminInstallation[],
  status: StatusFilter,
): AdminInstallation[] {
  if (status === "all") {
    return rows;
  }
  return rows.filter((row) => row.status === status);
}

function nextStepCopy(
  row: AdminInstallation,
  mode: "mock" | "github",
): { headline: string; detail: string } {
  if (row.unbound) {
    return {
      headline: "Cannot review yet",
      detail:
        "GitHub sent this install without a matching client ID. It cannot be approved from here.",
    };
  }
  if (!row.bound) {
    return {
      headline: "Connect GitHub",
      detail:
        mode === "mock"
          ? "The client exists, but GitHub is not connected yet. Complete the mock install, then you can approve."
          : "Send the product owner the install URL. After they install the GitHub App, come back and approve.",
    };
  }
  switch (row.status) {
    case "pending":
      return {
        headline: "Ready for your decision",
        detail:
          "GitHub is connected with read-only access. Approve to allow tokens, or reject to keep it unused.",
      };
    case "approved":
      return {
        headline: "Access is live",
        detail:
          "This client can receive short-lived tokens. Reject or revoke if that should stop.",
      };
    case "rejected":
      return {
        headline: "Rejected",
        detail:
          "Tokens are blocked. Re-approve to restore access without a new GitHub install.",
      };
    case "revoked":
      return {
        headline: "Access cut",
        detail:
          "Tokens are blocked. Re-approve to restore this install, or wait for a new GitHub install.",
      };
    default:
      return assertNever(row.status);
  }
}

function SegmentedControl({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; active: boolean }[];
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div
        role="tablist"
        aria-label={label}
        className="flex w-full flex-wrap items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground"
      >
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            role="tab"
            aria-selected={item.active}
            className={cn(
              "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
              item.active
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    status?: string;
    auditScope?: string;
    clientId?: string;
    installUrl?: string;
  }>;
}) {
  const query = parseAdminQuery(await searchParams);
  const config = getConfig();
  const connector = getConnector();
  const installations = connector.listInstallations();
  const visible = filterInstallations(installations, query.status);
  const selected =
    (query.clientId
      ? installations.find((row) => row.clientId === query.clientId)
      : undefined) ?? visible[0];
  const allAudit = connector.listAuditEvents();
  const auditEvents: AuditEvent[] =
    query.auditScope === "selected" && query.clientId
      ? connector.listAuditEvents(query.clientId)
      : allAudit;

  const withClient = (patch: Partial<AdminQuery>): AdminQuery => ({
    ...query,
    ...patch,
    clientId: patch.clientId ?? query.clientId,
    installUrl: patch.installUrl === undefined ? query.installUrl : patch.installUrl,
  });

  return (
    <div className="min-h-full bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              repo-connector
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Review access</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{config.mode} mode</Badge>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-4">
          <SegmentedControl
            label="View"
            items={[
              {
                label: "Installations",
                href: adminHref(withClient({ view: "queue" })),
                active: query.view === "queue",
              },
              {
                label: "Audit log",
                href: adminHref(withClient({ view: "audit" })),
                active: query.view === "audit",
              },
            ]}
          />
          {query.view === "queue" ? (
            <SegmentedControl
              label="Show"
              items={(
                [
                  ["pending", "Needs review"],
                  ["approved", "Approved"],
                  ["rejected", "Rejected"],
                  ["revoked", "Revoked"],
                  ["all", "All"],
                ] as const
              ).map(([status, label]) => ({
                label: `${label} (${countByStatus(installations, status)})`,
                href: adminHref(withClient({ view: "queue", status })),
                active: query.status === status,
              }))}
            />
          ) : (
            <SegmentedControl
              label="Show"
              items={[
                {
                  label: "All activity",
                  href: adminHref(withClient({ view: "audit", auditScope: "all" })),
                  active: query.auditScope === "all",
                },
                {
                  label: selected
                    ? `This client (${selected.clientId})`
                    : "This client",
                  href: adminHref(
                    withClient({ view: "audit", auditScope: "selected" }),
                  ),
                  active: query.auditScope === "selected",
                },
              ]}
            />
          )}
        </div>

        {query.view === "queue" ? (
          <QueueView
            query={query}
            configMode={config.mode}
            visible={visible}
            selected={selected}
            installUrl={query.installUrl}
          />
        ) : (
          <AuditView
            events={auditEvents}
            scopedToClient={
              query.auditScope === "selected" ? query.clientId : undefined
            }
          />
        )}
      </main>
    </div>
  );
}

function QueueView({
  query,
  configMode,
  visible,
  selected,
  installUrl,
}: {
  query: AdminQuery;
  configMode: "mock" | "github";
  visible: AdminInstallation[];
  selected: AdminInstallation | undefined;
  installUrl: string | undefined;
}) {
  const emptyFilter =
    query.status === "pending"
      ? "Nothing is waiting on you. Start a client below, or switch to All."
      : "No installations in this filter.";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">
            Next step
          </CardTitle>
          <CardDescription>
            Connect GitHub first, then approve. Tokens stay off until you do.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{emptyFilter}</p>
          ) : (
            <SelectedPanel
              selected={selected}
              configMode={configMode}
              query={query}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">
            {query.status === "pending" ? "Needs your review" : "Installations"}
          </CardTitle>
          <CardDescription>
            Click a client to change the next step above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyFilter}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next step</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => {
                  const step = nextStepCopy(row, configMode);
                  return (
                    <TableRow
                      key={row.clientId}
                      data-state={
                        row.clientId === selected?.clientId
                          ? "selected"
                          : undefined
                      }
                    >
                      <TableCell>
                        <Link
                          href={adminHref({
                            ...query,
                            view: "queue",
                            clientId: row.clientId,
                          })}
                          className="font-mono text-sm underline-offset-4 hover:underline"
                        >
                          {row.clientId}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {step.headline}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-xl">
            Start a client
          </CardTitle>
          <CardDescription>
            Use a stable ID from the product, such as docent:tenant-42.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            action={requestInstallAction}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                name="clientId"
                placeholder="docent:tenant-42"
                required
              />
            </div>
            <Button type="submit">Start</Button>
          </form>
          {installUrl ? (
            <p className="break-all text-sm text-muted-foreground">
              Install URL ready:{" "}
              <span className="font-mono text-xs">{installUrl}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SelectedPanel({
  selected,
  configMode,
  query,
}: {
  selected: AdminInstallation;
  configMode: "mock" | "github";
  query: AdminQuery;
}) {
  const step = nextStepCopy(selected, configMode);
  const showComplete =
    configMode === "mock" && !selected.bound && !selected.unbound;
  const showApprove =
    selected.bound &&
    !selected.unbound &&
    (selected.status === "pending" ||
      selected.status === "rejected" ||
      selected.status === "revoked");
  const showReject =
    selected.status === "pending" || selected.status === "approved";
  const showRevoke = selected.status !== "revoked";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-mono text-sm">{selected.clientId}</p>
        <h3 className="text-lg font-semibold">{step.headline}</h3>
        <p className="text-sm text-muted-foreground">{step.detail}</p>
      </div>
      {selected.accountLogin ? (
        <p className="text-sm">
          GitHub account:{" "}
          <span className="font-medium">{selected.accountLogin}</span>
        </p>
      ) : null}
      {selected.permissionsExcess ? (
        <p className="text-sm text-destructive">
          This install grants more than contents:read and metadata:read. Do not
          treat it as usable until permissions are corrected.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {showComplete ? (
          <form action={completeMockInstallAction}>
            <input type="hidden" name="clientId" value={selected.clientId} />
            <Button type="submit" variant="success">
              Connect GitHub (mock)
            </Button>
          </form>
        ) : null}
        {showApprove ? (
          <form action={approveAction}>
            <input type="hidden" name="clientId" value={selected.clientId} />
            <Button type="submit">
              {selected.status === "pending" ? "Approve access" : "Re-approve"}
            </Button>
          </form>
        ) : null}
        {showReject ? (
          <form action={rejectAction}>
            <input type="hidden" name="clientId" value={selected.clientId} />
            <Button type="submit" variant="destructive">
              Reject
            </Button>
          </form>
        ) : null}
        {showRevoke ? (
          <form action={revokeAction}>
            <input type="hidden" name="clientId" value={selected.clientId} />
            <Button type="submit" variant="warning">
              Revoke
            </Button>
          </form>
        ) : null}
      </div>

      <Link
        href={adminHref({
          ...query,
          view: "audit",
          auditScope: "selected",
          clientId: selected.clientId,
        })}
        className="inline-block text-sm font-medium underline-offset-4 hover:underline"
      >
        View audit history
      </Link>
    </div>
  );
}

function AuditView({
  events,
  scopedToClient,
}: {
  events: AuditEvent[];
  scopedToClient: string | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-xl">
          Audit log
        </CardTitle>
        <CardDescription>
          {scopedToClient
            ? `Events for ${scopedToClient}.`
            : "Every request, decision, token issue, and revocation."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {scopedToClient
              ? "No events for this client yet. Select a client from Installations first."
              : "No activity yet."}
          </p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-md border">
            <ul>
              {events.map((event) => (
                <li
                  key={event.id}
                  className="border-b px-4 py-3 last:border-b-0"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                    <span className="text-sm font-medium">
                      {auditLabel(event.action)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()} ·{" "}
                      {event.actor}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {event.clientId ?? "—"}
                    {event.detail ? ` · ${event.detail}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
