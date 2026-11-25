import { assertEquals } from "jsr:@std/assert@1";
import { constantTimeEqual, hasValidBearerToken, hasValidSharedSecret } from "../../supabase/functions/_shared/auth.ts";

Deno.test("shared-secret auth rejects missing configuration and wrong values", () => {
  const request = new Request("https://example.test", {
    headers: { "x-lead-radar-secret": "expected" },
  });

  assertEquals(hasValidSharedSecret(request, undefined, "x-lead-radar-secret"), false);
  assertEquals(hasValidSharedSecret(request, "", "x-lead-radar-secret"), false);
  assertEquals(hasValidSharedSecret(request, "expected", "x-lead-radar-secret"), true);
  assertEquals(hasValidSharedSecret(request, "other", "x-lead-radar-secret"), false);

  const missing = new Request("https://example.test");
  assertEquals(hasValidSharedSecret(missing, "expected", "x-lead-radar-secret"), false);
});

Deno.test("bearer auth requires the scheme and exact token", () => {
  const valid = new Request("https://example.test", {
    headers: { authorization: "Bearer token-123" },
  });
  const basic = new Request("https://example.test", {
    headers: { authorization: "Basic token-123" },
  });

  assertEquals(hasValidBearerToken(valid, "token-123"), true);
  assertEquals(hasValidBearerToken(valid, undefined), false);
  assertEquals(hasValidBearerToken(valid, "token-124"), false);
  assertEquals(hasValidBearerToken(basic, "token-123"), false);
  assertEquals(constantTimeEqual("same", "same"), true);
  assertEquals(constantTimeEqual("same", "diff"), false);
  assertEquals(constantTimeEqual("short", "shorter"), false);
});
