import { redirect } from "react-router";
import { signOut } from "~server/services";
import type { Route } from "./+types/logout";

export async function action({ request }: Route.ActionArgs) {
  return signOut(request);
}

export function loader() {
  return redirect("/");
}
