import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "./proxy";

// The presentation preview (D-047): no sign-in, no database, closed app routes.
describe("proxy in the presentation preview", () => {
  beforeEach(() => {
    process.env.QUICKPRO_SHOWCASE = "on";
  });
  afterEach(() => {
    delete process.env.QUICKPRO_SHOWCASE;
  });

  const go = (path: string) => proxy(new NextRequest(new URL(path, "https://preview.example")));

  it("shows the sample directory at the public addresses", async () => {
    const res = await go("/contractors?category=flooring");
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://preview.example/showcase/contractors?category=flooring");
    const profile = await go("/contractors/bayview-build-co");
    expect(profile.headers.get("x-middleware-rewrite")).toBe("https://preview.example/showcase/contractors/bayview-build-co");
  });

  it("sends sign-up links to the matching sample screen", async () => {
    expect((await go("/sign-up?as=customer")).headers.get("location")).toBe("https://preview.example/showcase/post-a-project");
    expect((await go("/sign-up?as=contractor")).headers.get("location")).toBe("https://preview.example/showcase/dashboard/contractor");
    expect((await go("/sign-up?as=worker")).headers.get("location")).toBe("https://preview.example/showcase/dashboard/worker");
  });

  it("closes every account, app and API route", async () => {
    for (const path of ["/app", "/app/org/x/invoices", "/sign-in", "/auth/sign-out", "/reset-password", "/invite/abc"]) {
      const res = await go(path);
      expect(res.status, path).toBe(307);
      expect(res.headers.get("location"), path).toBe("https://preview.example/showcase");
    }
    expect((await go("/api/stripe/webhook")).status).toBe(404);
  });

  it("leaves the public pages alone", async () => {
    for (const path of ["/", "/about", "/showcase", "/showcase/dashboard/worker"]) {
      const res = await go(path);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-middleware-rewrite"), path).toBeNull();
    }
  });
});
