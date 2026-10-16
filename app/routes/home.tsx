import { redirect } from "react-router";
import { getSessionUser } from "~server/services";
import { AppShell } from "~/components/layout/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { Route } from "./+types/home";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getSessionUser(request);
  if (!user) throw redirect("/login");
  return { user };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <AppShell user={user}>
      <Card>
        <CardHeader>
          <CardTitle>Signed in as {user.name}</CardTitle>
          <CardDescription>
            The skeleton is running. Customer, intake and package screens arrive with their work items.
          </CardDescription>
        </CardHeader>
      </Card>
    </AppShell>
  );
}
