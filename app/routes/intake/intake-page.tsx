import { data } from "react-router";
import { openIntake } from "~server/services";
import { IntakeExpired } from "./components/intake-expired";
import { IntakeTab1 } from "./components/intake-tab1";
import type { Route } from "./+types/intake-page";

/**
 * Screen E (WI-004): the customer's intake through the private link, no sign-in. The token is
 * the only credential (E5): a staff session grants nothing here, and an expired or replaced
 * link shows only the expired message. Tab 1 is generated from the vendored schema.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const view = await openIntake(params.token);
  if (view.kind !== "open") return data(view, { status: 410 });
  return view;
}

/** The token is in the URL: never cached, never sent on as a referrer. */
export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData && loaderData.kind === "open" ? `${loaderData.customer.name} · ` : "";
  return [{ title: `${name}FedRAMP intake · Ignyte` }, { name: "referrer", content: "no-referrer" }, { name: "robots", content: "noindex" }];
}

export default function IntakePage({ loaderData, params }: Route.ComponentProps) {
  if (loaderData.kind !== "open") return <IntakeExpired message={loaderData.message} />;
  return <IntakeTab1 view={loaderData} token={params.token} />;
}
