import { signInDev } from "~server/services";
import type { Route } from "./+types/dev-login";

// Dev-only sign-in (WI-010). Answers 404 unless NODE_ENV=development and DEV_LOGIN=1.
export async function action({ request }: Route.ActionArgs) {
  const response = await signInDev(request);
  return response ?? new Response("Not Found", { status: 404 });
}

export function loader() {
  return new Response("Not Found", { status: 404 });
}
