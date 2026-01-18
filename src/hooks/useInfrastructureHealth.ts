import { useState, useEffect } from 'react';
import type { HealthResponse } from '@/types/diagnostics';

const HEALTH_ENDPOINT = "/community-service/diagnostics/health";

export const useInfrastructureHealth = () => {
    const [data, setData] = useState<HealthResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchData = async () => {
        try {
            const controller = new AbortController();
            // 10s timeout for the heavy call
            const id = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(HEALTH_ENDPOINT, { 
                signal: controller.signal 
            });
            clearTimeout(id);

            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
                // If the server returns HTML (e.g. 404 page, 502 gateway error, or SPA fallback),
                // we should not try to parse it as JSON.
                const text = await response.text();
                console.error("Health API returned HTML instead of JSON. Check API URL or Proxy config.", text.substring(0, 150));
                throw new Error("Received HTML instead of JSON (likely 404 or Proxy Error).");
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch health data: ${response.status} ${response.statusText}`);
            }

            const json: HealthResponse = await response.json();
            setData(json);
            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            console.error("Health fetch error:", err);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    return { data, loading, error, lastUpdated, refresh: fetchData };
};
