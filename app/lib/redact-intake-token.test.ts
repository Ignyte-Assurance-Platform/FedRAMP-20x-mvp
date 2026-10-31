import { inspect } from "node:util";
import { UNSAFE_ErrorResponseImpl as ErrorResponseImpl } from "react-router";
import { describe, expect, it } from "vitest";
import { redactForLog, redactIntakeToken } from "./redact-intake-token";

const TOKEN = "Zk3p9QvT_x2bLm7NcA-8rWyE4uHs6DfG";

describe("redactIntakeToken (WI-020 2.1–2.3)", () => {
  it.each([
    [`/intake/${TOKEN}`, "/intake/[redacted]"],
    [`/intake/${TOKEN}/does-not-exist`, "/intake/[redacted]/does-not-exist"],
    [`/api/intake/${TOKEN}/x`, "/api/intake/[redacted]/x"],
    [`/login?p=%2Fintake%2F${TOKEN}`, "/login?p=%2Fintake%2F[redacted]"],
    [`/login?p=%2Fintake%2f${TOKEN}%2Fx`, "/login?p=%2Fintake%2f[redacted]%2Fx"],
    [`https://fedramp.example.com/intake/${TOKEN}?tab=3#top`, "https://fedramp.example.com/intake/[redacted]?tab=3#top"],
    [`No route matches URL "/intake/${TOKEN}/x"`, 'No route matches URL "/intake/[redacted]/x"'],
  ])("redacts %s", (input, expected) => {
    expect(redactIntakeToken(input)).toBe(expected);
  });

  it.each([
    "/customers/123/package",
    "/login",
    "/api/customers/8a3c/documents/1/download",
    "intake form saved",
    'You made a POST request to "/intake/x" but did not provide an `action` for route "routes/intake/intake-page"',
    "    at loader (C:/Work/FedRAMP-20x-mvp/app/routes/intake/intake-page.tsx:12:5)",
    "/customer-intake/settings",
  ])("leaves %s unchanged", (input) => {
    expect(redactIntakeToken(input)).toBe(input);
  });
});

describe("redactForLog (WI-020 2.1, 2.5)", () => {
  it("keeps the error type, the rest of the message and the stack, with the token redacted", () => {
    const error = new TypeError(`bad thing on /intake/${TOKEN}/x`);
    const logged = redactForLog(error) as Error;
    expect(logged).toBeInstanceOf(TypeError);
    expect(logged.message).toBe("bad thing on /intake/[redacted]/x");
    expect(logged.stack).toContain("TypeError: bad thing on /intake/[redacted]/x");
    expect(logged.stack).toContain("redact-intake-token.test.ts");
    expect(logged.stack).not.toContain(TOKEN);
    expect(error.message).toContain(TOKEN);
  });

  it("keeps cause, AggregateError's errors and other own properties, each redacted (second opinion)", () => {
    const cause = new Error(`fetch failed for /intake/${TOKEN}`);
    const error = Object.assign(new AggregateError([new Error(`one /intake/${TOKEN}`)], `failed /intake/${TOKEN}`, { cause }), { input: `/intake/${TOKEN}`, code: "ERR_X" });
    const logged = redactForLog(error) as AggregateError & { input: string; code: string };
    expect(logged).toBeInstanceOf(AggregateError);
    expect((logged.cause as Error).message).toBe("fetch failed for /intake/[redacted]");
    expect(logged.errors[0].message).toBe("one /intake/[redacted]");
    expect(logged.input).toBe("/intake/[redacted]");
    expect(logged.code).toBe("ERR_X");
    const printed = inspect(logged);
    expect(printed).toContain("[cause]");
    expect(printed).toContain("[errors]");
    expect(printed).not.toContain(TOKEN);
  });

  it("redacts the inner error of a route error response; without one it logs the response itself, redacted", () => {
    const inner = new Error(`No route matches URL "/intake/${TOKEN}/x"`);
    expect((redactForLog(new ErrorResponseImpl(404, "Not Found", inner, true)) as Error).stack).toContain("/intake/[redacted]/x");
    const logged = redactForLog(new ErrorResponseImpl(404, "Not Found", `/intake/${TOKEN}`));
    expect(logged).toBeInstanceOf(ErrorResponseImpl);
    expect(inspect(logged)).not.toContain(TOKEN);
  });
});
