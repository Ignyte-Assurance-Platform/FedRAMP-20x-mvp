import { redirect } from "react-router";
import { requireStaffUser } from "~server/services";
import type { Route } from "./+types/home";

/** "/" is Screen B for a signed-in consultant (WI-003); anyone else goes to /login. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireStaffUser(request);
  throw redirect("/customers");
}
