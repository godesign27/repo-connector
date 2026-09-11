import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function InstallDonePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const failed = Boolean(params.error);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>
            {failed ? "Install callback failed" : "Installation recorded"}
          </CardTitle>
          <CardDescription>
            {failed
              ? "The setup callback was missing state or the signed state did not match. Request a new install URL."
              : "This install is pending manual approval. Repo access tokens will not be issued until an admin approves it."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {params.clientId ? (
            <p>
              Client: <span className="font-mono">{params.clientId}</span>
            </p>
          ) : null}
          {params.status ? (
            <p>
              Status: <span className="font-mono">{params.status}</span>
            </p>
          ) : null}
          <Link href="/admin" className="text-primary underline-offset-4 hover:underline">
            Open admin approval queue
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
