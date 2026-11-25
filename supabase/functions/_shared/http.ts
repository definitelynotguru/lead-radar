export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function corsHeaders(): Record<string, string> {
  const allowedOrigin = Deno.env.get("DASHBOARD_ALLOWED_ORIGIN") ?? "http://localhost:5173";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-lead-radar-secret",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export function corsJsonResponse(body: unknown, status = 200): Response {
  return jsonResponse(body, status, corsHeaders());
}
