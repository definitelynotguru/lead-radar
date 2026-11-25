type Handler = (request: Request) => Response | Promise<Response>;

export function serveEntrypoint(handler: Handler): void {
  const port = Deno.env.get("PORT");
  if (port) {
    const hostname = Deno.env.get("HOST") ?? "127.0.0.1";
    Deno.serve({ hostname, port: Number(port) }, handler);
    return;
  }
  Deno.serve(handler);
}
