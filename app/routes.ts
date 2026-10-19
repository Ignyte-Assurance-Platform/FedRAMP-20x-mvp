import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";

// Explicit route config (ADR-0006): no file-name magic. Feature routes for customers,
// intake and package arrive with WI-003 to WI-007.
export default [
  index("routes/home.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("logout", "routes/auth/logout.ts"),
  ...prefix("api", [
    route("health", "routes/api/health.ts"),
    route("dev-login", "routes/api/dev-login.ts"),
    route("uploads/:token", "routes/api/uploads.$token.ts"),
  ]),
] satisfies RouteConfig;
