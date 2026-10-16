import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./styles/app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Maaz 20x" }];

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something went wrong";
  const detail = isRouteErrorResponse(error)
    ? error.data
    : import.meta.env.DEV && error instanceof Error
      ? error.stack
      : "Please try again.";
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap text-sm text-muted-foreground">{String(detail)}</pre>
    </main>
  );
}
