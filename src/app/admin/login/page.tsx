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
import { loginAction } from "@/app/admin/actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-muted/40 px-4 py-16">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium text-muted-foreground">repo-connector</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Admin sign in</h1>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h2" className="text-xl">
            Approval queue
          </CardTitle>
          <CardDescription>
            Gated by ADMIN_SECRET. There are no multi-user roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password">Admin secret</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {params.error ? (
              <p className="text-sm text-destructive" role="alert">
                Secret did not match.
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
