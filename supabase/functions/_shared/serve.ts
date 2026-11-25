type Handler = (request: Request) => Response | Promise<Response>;

export function serveEntrypoint(handler: Handler): void {
  const port = Deno.env.get("PORT");
  if (port) {
    Deno.serve({ port: Number(port) }, handler);
    return;
  }
  Deno.serve(handler);
}
