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

            if (!response.ok) {
                throw new Error(`Failed to fetch health data: ${response.status}`);
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
