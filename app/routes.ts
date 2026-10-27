import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";

// Explicit route config (ADR-0006): no file-name magic. Intake routes arrive with WI-004 to WI-006.
export default [
  index("routes/home.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("logout", "routes/auth/logout.ts"),
  // Screens B and C (WI-003) and Screen D (WI-007): staff only.
  route("customers", "routes/customers/customers-list.tsx"),
  route("customers/new", "routes/customers/customer-new.tsx"),
  route("customers/:customerId/package", "routes/package/customer-package.tsx"),
  ...prefix("api", [
    route("health", "routes/api/health.ts"),
    route("dev-login", "routes/api/dev-login.ts"),
    route("uploads/:token", "routes/api/uploads.$token.ts"),
    route("customers/:customerId/package-overview/download", "routes/api/package-overview-download.ts"),
  ]),
] satisfies RouteConfig;
