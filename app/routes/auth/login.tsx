import { data, Form, redirect } from "react-router";
import { getSessionUser, getSignInOptions, signInErrorMessage, startGoogleSignIn } from "~server/services";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { Route } from "./+types/login";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getSessionUser(request)) throw redirect("/");
  const error = signInErrorMessage(new URL(request.url).searchParams.get("error"));
  return { ...getSignInOptions(), error };
}

export async function action({ request }: Route.ActionArgs) {
  const response = await startGoogleSignIn(request);
  if (!response) return data({ error: "Google sign-in is not configured yet." }, { status: 400 });
  return response;
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const { devLogin, google, error } = loaderData;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Maaz 20x</CardTitle>
          <CardDescription>Ignyte staff sign in with their Google Workspace account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Form method="post">
            <Button type="submit" className="w-full" disabled={!google}>
              Sign in with Google
            </Button>
          </Form>
          {!google && (
            <p className="text-sm text-muted-foreground">Google sign-in turns on once the OAuth client exists.</p>
          )}
          {(actionData?.error ?? error) && (
            <p role="alert" className="text-sm text-destructive">
              {actionData?.error ?? error}
            </p>
          )}
          {devLogin && (
            <Form method="post" action="/api/dev-login" reloadDocument>
              <Button type="submit" variant="outline" className="w-full">
                Dev sign-in (local only)
              </Button>
            </Form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
