import { inspect } from "node:util";
import { UNSAFE_ErrorResponseImpl as ErrorResponseImpl, RouterContextProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateIntakeToken } from "~server/services";
import { handleError } from "./entry.server";
import { redactIntakeToken } from "./lib/redact-intake-token";

const TOKEN = "Zk3p9QvT_x2bLm7NcA-8rWyE4uHs6DfG";
const args = (signal?: AbortSignal) => ({ request: new Request(`http://localhost/intake/${TOKEN}/x`, { signal }), params: {}, context: new RouterContextProvider() });

describe("intake token format (WI-020)", () => {
  it("the helper redacts tokens from the real generator, so a change of token format fails here", () => {
    for (let i = 0; i < 50; i++) expect(redactIntakeToken(`/intake/${generateIntakeToken()}/x`)).toBe("/intake/[redacted]/x");
  });
});

describe("handleError (WI-020 2.1, 2.4)", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["an Error", () => new Error(`No route matches URL "/intake/${TOKEN}/x"`)],
    ["a route error response wrapping it", () => {
      const inner = new Error(`No route matches URL "/intake/${TOKEN}/x"`);
      return new ErrorResponseImpl(404, "Not Found", inner, true);
    }],
  ])("logs %s with /intake/[redacted] and never the token", (_name, make) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    handleError(make(), args());
    expect(log).toHaveBeenCalledTimes(1);
    const printed = inspect(log.mock.calls[0]![0]);
    expect(printed).toContain('No route matches URL "/intake/[redacted]/x"');
    expect(printed).not.toContain(TOKEN);
  });

  it("logs nothing for an aborted request", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = new AbortController();
    controller.abort();
    handleError(new Error(`/intake/${TOKEN}`), args(controller.signal));
    expect(log).not.toHaveBeenCalled();
  });
});
