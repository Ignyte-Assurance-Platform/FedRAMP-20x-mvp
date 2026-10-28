import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";

// Explicit route config (ADR-0006): no file-name magic.
export default [
  index("routes/home.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("logout", "routes/auth/logout.ts"),
  // Screens B and C (WI-003) and Screen D (WI-007): staff only.
  route("customers", "routes/customers/customers-list.tsx"),
  route("customers/new", "routes/customers/customer-new.tsx"),
  route("customers/:customerId/package", "routes/package/customer-package.tsx"),
  // Screen E (WI-004): the customer's private link, no sign-in; the token is the only credential.
  route("intake/:token", "routes/intake/intake-page.tsx"),
  ...prefix("api", [
    route("health", "routes/api/health.ts"),
    route("dev-login", "routes/api/dev-login.ts"),
    route("intake/:token", "routes/api/intake.$token.ts"),
    route("customers/:customerId/package-overview/download", "routes/api/package-overview-download.ts"),
  ]),
] satisfies RouteConfig;
