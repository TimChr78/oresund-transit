// Ambient declarations for the plain-JS Pages Function modules imported by tests.
// TS matches the '*' wildcard against the relative specifier including '../'.
declare module '*functions/[[path]].js' {
  export function onRequest(context: unknown): Promise<Response>;
}
declare module '*functions/sitemap.xml.js' {
  export function onRequest(context: unknown): Promise<Response>;
}
declare module '*functions/feed.xml.js' {
  export function onRequest(context: unknown): Promise<Response>;
}
