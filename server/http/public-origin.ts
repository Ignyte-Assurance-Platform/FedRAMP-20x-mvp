/**
 * WI-016: Cloud Run ends TLS in front of the container, so the app builds every request URL
 * as http://<host> while the browser's Origin is https://<host>. React Router's CSRF check
 * compares the two and refuses every action. In production the request is rebuilt on the
 * public origin of APP_URL (configuration Ignyte controls, unlike X-Forwarded-Proto, which a
 * client can also send); path, query, method, headers and body are kept.
 */
export function withPublicOrigin(request: Request, publicOrigin: string): Request {
  const target = new URL(publicOrigin).origin;
  const url = new URL(request.url);
  if (url.origin === target) return request;
  // Built from the origin, not by setting url.host: that setter keeps the old port when the
  // public host has none (http://host:8080 would become https://host:8080).
  // Passing the request as init forwards a streamed body because a Request carries duplex: "half".
  return new Request(new URL(url.pathname + url.search, target), request);
}
