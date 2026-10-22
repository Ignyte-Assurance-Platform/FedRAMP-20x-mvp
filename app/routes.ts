import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";

// Explicit route config (ADR-0006): no file-name magic. Feature routes for customers
// and intake arrive with WI-003 to WI-006.
export default [
  index("routes/home.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("logout", "routes/auth/logout.ts"),
  // Screen D (WI-007): staff only.
  route("customers/:customerId/package", "routes/package/customer-package.tsx"),
  ...prefix("api", [
    route("health", "routes/api/health.ts"),
    route("dev-login", "routes/api/dev-login.ts"),
    route("uploads/:token", "routes/api/uploads.$token.ts"),
    route("customers/:customerId/package-overview/download", "routes/api/package-overview-download.ts"),
  ]),
] satisfies RouteConfig;
