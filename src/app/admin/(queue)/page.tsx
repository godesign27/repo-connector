import Link from "next/link";
import {
  approveAction,
  completeMockInstallAction,
  logoutAction,
  rejectAction,
  requestInstallAction,
  revokeAction,
} from "@/app/admin/actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assertNever } from "@/core/assert-never";
import type { RecordedInstallationStatus } from "@/core/types";
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

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; installUrl?: string }>;
}) {
  const params = await searchParams;
  const config = getConfig();
  const connector = getConnector();
  const installations = connector.listInstallations();
  const selectedId = params.clientId;
  const selected = installations.find((row) => row.clientId === selectedId);
  const audit = selectedId ? connector.listAuditEvents(selectedId) : [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-medium">Approval queue</h1>
          <p className="text-sm text-muted-foreground">
            Every GitHub App install stays pending until you approve it. Tokens
            are never issued automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{config.mode} mode</Badge>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Request an install</CardTitle>
          <CardDescription>
            Creates a pending client and a signed GitHub (or mock) install URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            action={requestInstallAction}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                name="clientId"
                placeholder="docent-tenant-42"
                required
              />
            </div>
            <Button type="submit">Create install request</Button>
          </form>
          {params.installUrl ? (
            <p className="break-all font-mono text-xs text-muted-foreground">
              Install URL: {params.installUrl}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Installations</CardTitle>
          <CardDescription>
            {installations.length === 0
              ? "No installations yet. Request one above or wait for a webhook."
              : `${installations.length} tracked install${installations.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {installations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The queue is empty.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installations.map((row) => (
                  <TableRow
                    key={row.clientId}
                    data-state={
                      row.clientId === selectedId ? "selected" : undefined
                    }
                  >
                    <TableCell>
                      <Link
                        href={`/admin?clientId=${encodeURIComponent(row.clientId)}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {row.clientId}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.accountLogin ?? "—"}</TableCell>
                    <TableCell>
                      {row.permissionsExcess ? (
                        <Badge variant="destructive">excess</Badge>
                      ) : row.bound ? (
                        <span>read-only</span>
                      ) : (
                        <span className="text-muted-foreground">unbound</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selected installation</CardTitle>
          <CardDescription>
            {selected
              ? `${selected.clientId} · ${selected.provider}`
              : "Choose a client from the table to approve, reject, or inspect the audit log."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">Nothing selected.</p>
          ) : (
            <>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Bound to provider</dt>
                  <dd>{selected.bound ? "yes" : "no"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Unmatched webhook</dt>
                  <dd>{selected.unbound ? "yes" : "no"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Permissions</dt>
                  <dd className="font-mono text-xs">
                    {JSON.stringify(selected.permissions)}
                  </dd>
                </div>
              </dl>

              {selected.permissionsExcess ? (
                <p className="text-sm text-destructive">
                  This install grants more than contents:read and metadata:read.
                  Approve will record, but token issuance stays blocked until
                  permissions are corrected and the install is rebound.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {config.mode === "mock" && !selected.bound && !selected.unbound ? (
                  <form action={completeMockInstallAction}>
                    <input type="hidden" name="clientId" value={selected.clientId} />
                    <Button type="submit" variant="secondary">
                      Complete mock install
                    </Button>
                  </form>
                ) : null}
                {selected.bound &&
                !selected.unbound &&
                (selected.status === "pending" ||
                  selected.status === "rejected" ||
                  selected.status === "revoked") ? (
                  <form action={approveAction}>
                    <input type="hidden" name="clientId" value={selected.clientId} />
                    <Button type="submit">
                      {selected.status === "pending" ? "Approve" : "Re-approve"}
                    </Button>
                  </form>
                ) : null}
                {selected.status === "pending" || selected.status === "approved" ? (
                  <form action={rejectAction}>
                    <input type="hidden" name="clientId" value={selected.clientId} />
                    <Button type="submit" variant="secondary">
                      Reject
                    </Button>
                  </form>
                ) : null}
                {selected.status !== "revoked" ? (
                  <form action={revokeAction}>
                    <input type="hidden" name="clientId" value={selected.clientId} />
                    <Button type="submit" variant="destructive">
                      Revoke
                    </Button>
                  </form>
                ) : null}
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-medium">Audit log</h2>
                {audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No events for this client.
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {audit.map((event) => (
                      <li key={event.id} className="px-3 py-2 text-sm">
                        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                          <span className="font-mono text-xs">{event.action}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString()} ·{" "}
                            {event.actor}
                          </span>
                        </div>
                        {event.detail ? (
                          <p className="text-xs text-muted-foreground">
                            {event.detail}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
