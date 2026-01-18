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
    "/community-service"
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
