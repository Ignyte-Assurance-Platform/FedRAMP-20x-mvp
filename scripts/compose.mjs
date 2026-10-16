#!/usr/bin/env node
// Runs `<runtime> compose <args>` with Docker if it is installed and running, else Podman.
// Override with CONTAINER_RUNTIME=docker|podman.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

function works(runtime) {
  return spawnSync(runtime, ["info"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;
}

const runtime =
  process.env.CONTAINER_RUNTIME ?? ["docker", "podman"].find(works);

if (!runtime) {
  console.error(
    "No running container runtime found. Start Docker Desktop or Podman (podman machine start), " +
      "or set CONTAINER_RUNTIME.",
  );
  process.exit(1);
}

// Podman's `compose` subcommand may not support --wait; fall back to polling health.
const result = spawnSync(runtime, ["compose", ...args], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
