import { describe, expect, it } from "vitest";
import { withPublicOrigin } from "./public-origin";

const PUBLIC = "https://app.example.test";

describe("withPublicOrigin (WI-016)", () => {
  it("2.3 moves the request to the public origin and keeps path, query, method, headers and body", async () => {
    const original = new Request("http://app.example.test/login?next=%2Fcustomers", {
      method: "POST",
      headers: { origin: PUBLIC, "content-type": "application/x-www-form-urlencoded", cookie: "a=1" },
      body: "intent=google",
    });

    const rewritten = withPublicOrigin(original, PUBLIC);

    expect(rewritten.url).toBe("https://app.example.test/login?next=%2Fcustomers");
    expect(rewritten.method).toBe("POST");
    expect(rewritten.headers.get("origin")).toBe(PUBLIC);
    expect(rewritten.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(rewritten.headers.get("cookie")).toBe("a=1");
    expect(await rewritten.text()).toBe("intent=google");
  });

  it("takes the host from APP_URL too, not only the scheme", () => {
    const rewritten = withPublicOrigin(new Request("http://10.0.0.5:8080/customers"), PUBLIC);
    expect(rewritten.url).toBe("https://app.example.test/customers");
  });

  it("returns the same request when it is already on the public origin", () => {
    const request = new Request(`${PUBLIC}/customers`);
    expect(withPublicOrigin(request, PUBLIC)).toBe(request);
  });
});
