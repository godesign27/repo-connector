import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function InstallDonePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const failed = Boolean(params.error);

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-muted/40 px-4 py-16">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle as="h1" className="text-xl">
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
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/admin">Open admin approval queue</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
