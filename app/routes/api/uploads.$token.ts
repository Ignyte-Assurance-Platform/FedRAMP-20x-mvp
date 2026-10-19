import { handleLocalStorageRequest } from "~server/services";
import type { Route } from "./+types/uploads.$token";

// Signed URLs of the local storage driver point here (PUT to upload, GET to download).
// With STORAGE_DRIVER=gcs the browser talks to the bucket and this route answers 404.
export async function loader({ request, params }: Route.LoaderArgs) {
  return handleLocalStorageRequest(params.token, request);
}

export async function action({ request, params }: Route.ActionArgs) {
  return handleLocalStorageRequest(params.token, request);
}
