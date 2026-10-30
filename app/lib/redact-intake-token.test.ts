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

  it.each(["/customers/123/package", "/login", "/api/customers/8a3c/documents/1/download", "intake form saved"])("leaves %s unchanged", (input) => {
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

  it("redacts the inner error of a route error response, and its text data when it has none", () => {
    const inner = new Error(`No route matches URL "/intake/${TOKEN}/x"`);
    expect((redactForLog(new ErrorResponseImpl(404, "Not Found", inner, true)) as Error).stack).toContain("/intake/[redacted]/x");
    expect(JSON.stringify(redactForLog(new ErrorResponseImpl(404, "Not Found", `/intake/${TOKEN}`)))).not.toContain(TOKEN);
  });
});
