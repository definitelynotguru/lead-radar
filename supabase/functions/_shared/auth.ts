export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function hasValidSharedSecret(request: Request, secret: string | undefined, headerName: string): boolean {
  if (!secret) return false;
  return constantTimeEqual(request.headers.get(headerName) ?? "", secret);
}

export function hasValidBearerToken(request: Request, token: string | undefined): boolean {
  if (!token) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  return constantTimeEqual(authorization.slice(prefix.length), token);
}
