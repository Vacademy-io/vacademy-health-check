/**
 * The single internal-auth path the dashboard may reach, and the only request the
 * shared secret is ever attached to. Scoped to one GET on purpose: the secret lives
 * here rather than in the bundle, so this function must not become a general gateway
 * into the internal surface.
 */
const AI_QUEUE_PATH = "/admin-core-service/internal/ai-queue/snapshot";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  const SERVICES = [
    "/auth-service",
    "/admin-core-service",
    "/media-service",
    "/assessment-service",
    "/notification-service",
    "/ai-service",
    "/community-service",
    "/analytics-api"
  ];

  // Check if the current path starts with any of the service prefixes
  const isServiceRequest = SERVICES.some(prefix => path.startsWith(prefix));

  if (isServiceRequest) {
    const targetUrl = `https://backend-stage.vacademy.io${path}${url.search}`;
    
    // Create new headers base on the original request
    const newHeaders = new Headers(context.request.headers);
    
    // 'changeOrigin': true behavior - spoof the Host and Origin
    newHeaders.set('Host', 'backend-stage.vacademy.io');
    newHeaders.set('Origin', 'https://backend-stage.vacademy.io');
    newHeaders.set('Referer', 'https://backend-stage.vacademy.io/');

    // InternalAuthFilter validates a client pair against client_secret_key and ignores
    // user sessions, so this one path swaps the caller's token for the client secret —
    // which is held as a Pages env binding and never reaches the browser.
    if (context.request.method === 'GET' && path === AI_QUEUE_PATH) {
      newHeaders.delete('Authorization');
      newHeaders.delete('clientId');
      if (context.env?.AI_QUEUE_CLIENT_NAME) {
        newHeaders.set('clientName', context.env.AI_QUEUE_CLIENT_NAME);
      }
      if (context.env?.AI_QUEUE_SIGNATURE) {
        newHeaders.set('Signature', context.env.AI_QUEUE_SIGNATURE);
      }
    }

    // Create a new request with the updated info
    const newRequest = new Request(targetUrl, {
        method: context.request.method,
        headers: newHeaders,
        body: context.request.body,
        redirect: 'follow'
    });

    try {
        const response = await fetch(newRequest);
        return response;
    } catch (e) {
        return new Response(`Proxy Error: ${e.message}`, { status: 500 });
    }
  }

  // Not a service request, usually a static asset or SPA route
  return context.next();
}
