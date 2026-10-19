import { checkHealth } from "~server/services";

export async function loader() {
  const health = await checkHealth();
  return Response.json(health, { status: health.status === "ok" ? 200 : 503 });
}
