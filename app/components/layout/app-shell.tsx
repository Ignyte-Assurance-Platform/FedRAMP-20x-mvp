import type * as React from "react";
import { Form } from "react-router";
import { Button } from "~/components/ui/button";

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="font-semibold">Maaz 20x</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{user.email}</span>
            <Form method="post" action="/logout">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </Form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
