/**
 * Types for the plain-JS Pages Function (functions/[[path]].js). The function
 * itself is bundled by wrangler at deploy time and never typechecked; this
 * sidecar gives the vitest smoke tests a typed surface to import.
 */
export function onRequest(context: {
  request: Request;
  env: Record<string, unknown>;
}): Promise<Response>;
