import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Activity, CheckCircle, AlertTriangle, XCircle, Server, Database, Cloud, RefreshCw, Network, Clock } from "lucide-react";
import { format } from "date-fns";

// --- Types ---

interface HealthResponse {
  timestamp: string;
  overall_status: string;
  kubernetes_infrastructure: {
    ingress_nginx: K8sComponentStatus;
    cert_manager: K8sComponentStatus;
    calico_network: K8sComponentStatus;
    load_balancer: LoadBalancerStatus;
  };
  application_services: ServiceStatus[];
  dependencies: {
    redis: DependencyStatus;
    postgresql: DatabaseStatus;
  };
  connectivity_matrix: ConnectivityCheck[];
  recent_events: K8sEvent[];
}

interface K8sComponentStatus {
  status: string;
  ready_replicas?: number;
  total_replicas?: number;
  restart_count?: number;
  pods?: PodInfo[];
}

interface LoadBalancerStatus {
  status: string;
  external_ip: string;
  ports: string[];
}

interface PodInfo {
  name: string;
  status: string;
  ready: boolean;
  restarts: number;
  age: string;
  node?: string;
}

interface ServiceStatus {
  name: string;
  status: string;
  response_time_ms: number;
  health_endpoint?: string;
}

interface DependencyStatus {
  status: string;
  connected: boolean;
  response_time_ms: number;
  host?: string;
  port?: number;
  database_name?: string;
}

interface DatabaseStatus extends DependencyStatus {
  url?: string;
}

interface ConnectivityCheck {
  source: string;
  target: string;
  status: string;
  response_time_ms: number;
  error_message?: string;
  last_check?: string;
}

interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  object: string;
  namespace: string;
  timestamp: string;
  count?: number;
}


// --- Mock Data ---

const MOCK_FULL_HEALTH: HealthResponse = {
  timestamp: new Date().toISOString(),
  overall_status: "HEALTHY",
  kubernetes_infrastructure: {
    ingress_nginx: {
      status: "UP",
      ready_replicas: 1,
      total_replicas: 1,
      restart_count: 0,
      pods: [
        {
          name: "ingress-nginx-controller-abc",
          status: "Running",
          ready: true,
          restarts: 0,
          age: "2d",
          node: "lke-node-1"
        }
      ]
    },
    cert_manager: {
      status: "UP",
      ready_replicas: 1,
      total_replicas: 1,
      restart_count: 0,
      pods: []
    },
    calico_network: { status: "UP" },
    load_balancer: {
      status: "ACTIVE",
      external_ip: "172.232.85.240",
      ports: ["80/TCP", "443/TCP"]
    }
  },
  application_services: [
    {
      name: "auth-service",
      status: "UP",
      response_time_ms: 45,
      health_endpoint: "http://auth-service:8071/auth-service/actuator/health"
    },
    {
      name: "admin-core-service",
      status: "UP",
      response_time_ms: 62
    },
    { "name": "media-service", "status": "UP", "response_time_ms": 12 },
    { "name": "assessment-service", "status": "UP", "response_time_ms": 30 },
    { "name": "notification-service", "status": "UP", "response_time_ms": 25 }
  ],
  dependencies: {
    redis: {
      status: "UP",
      connected: true,
      response_time_ms: 2,
      host: "redis",
      port: 6379
    },
    postgresql: {
      status: "UP",
      connected: true,
      response_time_ms: 15,
      database_name: "vacademy_db"
    }
  },
  connectivity_matrix: [
    {
      source: "auth-service",
      target: "admin-core-service",
      status: "OK",
      response_time_ms: 23
    },
    {
      source: "admin-core-service",
      target: "auth-service",
      status: "OK",
      response_time_ms: 18
    },
     {
      source: "admin-core-service",
      target: "media-service",
      status: "FAILED",
      response_time_ms: -1,
      error_message: "Connection refused",
      last_check: new Date().toISOString()
    }
  ],
  recent_events: [
    {
      type: "Warning",
      reason: "Unhealthy",
      message: "Liveness probe failed",
      object: "pod/old-pod-xyz",
      namespace: "default",
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString()
    },
    {
      type: "Warning",
      reason: "FailedScheduling",
      message: "0/3 nodes are available: 3 Insufficient cpu.",
      object: "pod/redis-xyz",
      namespace: "default",
      timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      count: 5
    }
  ]
};

// --- Components ---

const StatusBadge = ({ status }: { status: string }) => {
  const normStatus = status.toUpperCase();
  let variant: "default" | "secondary" | "destructive" | "outline" | "section_header" | "success" | "warning" = "default";
  
  if (["UP", "HEALTHY", "OK", "ACTIVE", "RUNNING"].includes(normStatus)) variant = "success";
  else if (["DOWN", "FAILED", "ERROR", "CRITICAL"].includes(normStatus)) variant = "destructive";
  else if (["WARNING", "DEGRADED"].includes(normStatus)) variant = "warning";
  else variant = "secondary";

  return <Badge variant={variant}>{status}</Badge>;
};

const ServiceCard = ({ service }: { service: ServiceStatus }) => (
  <Card className="flex flex-row items-center justify-between p-4 mb-2">
    <div className="flex items-center gap-4">
      <div className={`p-2 rounded-full ${service.status === 'UP' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
        <Activity className="h-4 w-4" />
      </div>
      <div>
        <h4 className="font-semibold text-sm">{service.name}</h4>
        <p className="text-xs text-muted-foreground">{service.response_time_ms}ms latency</p>
      </div>
    </div>
    <StatusBadge status={service.status} />
  </Card>
);

const PodRow = ({ pod }: { pod: PodInfo }) => (
  <div className="flex items-center justify-between py-2 border-b last:border-0">
    <div className="flex flex-col">
      <span className="font-medium text-sm">{pod.name}</span>
      <span className="text-xs text-muted-foreground">{pod.namespace}</span>
    </div>
    <div className="flex items-center gap-4">
      <span className="text-xs text-muted-foreground">{pod.age}</span>
      <Badge variant="outline" className={pod.ready ? "border-green-500 text-green-500" : "border-yellow-500 text-yellow-500"}>
        {pod.status}
      </Badge>
    </div>
  </div>
);

const ServiceConnectivityMap = ({ matrix }: { matrix: ConnectivityCheck[] }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {matrix.map((conn, idx) => (
      <Card key={idx} className="p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-2">
           <Badge variant="outline" className="text-xs">{conn.source}</Badge>
           <Activity className="w-4 h-4 text-muted-foreground" />
           <Badge variant="outline" className="text-xs">{conn.target}</Badge>
        </div>
        
        <div className="flex justify-between items-center mt-2">
            <span className="text-sm font-semibold">{conn.response_time_ms > 0 ? `${conn.response_time_ms}ms` : 'N/A'}</span>
            <StatusBadge status={conn.status} />
        </div>
        {conn.error_message && (
             <p className="text-xs text-destructive mt-1 bg-destructive/10 p-1 rounded line-clamp-2">{conn.error_message}</p>
        )}
      </Card>
    ))}
  </div>
);



export default function InfrastructureDashboard() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    setLoading(true);
    // Simulate network delay
    setTimeout(() => {
        setData(MOCK_FULL_HEALTH);
        setLastUpdated(new Date());
        setLoading(false);
    }, 800);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (!data && loading) {
     return <div className="flex h-screen items-center justify-center">
         <div className="flex flex-col items-center gap-4">
             <RefreshCw className="h-8 w-8 animate-spin text-primary" />
             <p className="text-muted-foreground">Loading Diagnostics...</p>
         </div>
     </div>
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Infrastructure Diagnostics</h1>
          <p className="text-muted-foreground">Real-time system health and connectivity monitoring.</p>
        </div>
        <div className="flex items-center gap-2">
           <span className="text-xs text-muted-foreground tabular-nums">
             Updated: {lastUpdated ? format(lastUpdated, "HH:mm:ss") : "--:--:--"}
           </span>
           <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
             <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
             Refresh
           </Button>
        </div>
      </div>

        {/* Top Level Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{data.overall_status}</div>
            <p className="text-xs text-muted-foreground">System is operating normally</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Services Active</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.application_services.length}</div>
            <p className="text-xs text-muted-foreground">
                {(data.application_services.reduce((acc, s) => acc + s.response_time_ms, 0) / data.application_services.length).toFixed(0)}ms avg latency
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Database</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="flex items-center gap-2">
                <div className="text-2xl font-bold">{data.dependencies.postgresql.status}</div>
             </div>
             <p className="text-xs text-muted-foreground">{data.dependencies.postgresql.response_time_ms}ms response time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kubernetes Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.recent_events.length}</div>
            <p className="text-xs text-muted-foreground">Warnings in last hour</p>
          </CardContent>
        </Card>
      </div>


      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="kubernetes">Kubernetes</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="connectivity">Connectivity</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
           <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
              <Card className="col-span-4">
                <CardHeader>
                  <CardTitle>Application Health</CardTitle>
                   <CardDescription>
                    Core microservices status and latency.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {data.application_services.map(service => (
                        <div key={service.name} className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${service.status === 'UP' ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span className="font-medium">{service.name}</span>
                             </div>
                             <div className="flex items-center gap-4">
                                <span className="text-sm text-muted-foreground">{service.response_time_ms}ms</span>
                                <Progress value={Math.max(5, 100 - (service.response_time_ms / 2))} className="w-[100px]" />
                             </div>
                        </div>
                    ))}
                </CardContent>
              </Card>

              <Card className="col-span-3">
                <CardHeader>
                  <CardTitle>Infrastructure</CardTitle>
                  <CardDescription>
                    Key infrastructure components.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Cloud className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Ingress Nginx</span>
                        </div>
                         <StatusBadge status={data.kubernetes_infrastructure.ingress_nginx.status} />
                    </div>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Network className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Load Balancer</span>
                        </div>
                         <StatusBadge status={data.kubernetes_infrastructure.load_balancer.status} />
                    </div>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Redis Cache</span>
                        </div>
                         <StatusBadge status={data.dependencies.redis.status} />
                    </div>
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Calico Network</span>
                        </div>
                         <StatusBadge status={data.kubernetes_infrastructure.calico_network.status} />
                    </div>
                </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="kubernetes" className="space-y-4">
           <div className="grid gap-4 md:grid-cols-2">
              <Card>
                  <CardHeader>
                      <CardTitle>Ingress Controller</CardTitle>
                  </CardHeader>
                  <CardContent>
                       <div className="space-y-4">
                           <div className="flex justify-between">
                               <span>Replicas</span>
                               <span className="font-mono">{data.kubernetes_infrastructure.ingress_nginx.ready_replicas} / {data.kubernetes_infrastructure.ingress_nginx.total_replicas}</span>
                           </div>
                            <Separator />
                           <h4 className="text-sm font-semibold mb-2">Pods</h4>
                           {data.kubernetes_infrastructure.ingress_nginx.pods?.map((pod, i) => (
                               <PodRow key={i} pod={{...pod, namespace: 'ingress-nginx'}} />
                           ))}
                       </div>
                  </CardContent>
              </Card>
               <Card>
                  <CardHeader>
                      <CardTitle>Cluster Events</CardTitle>
                      <CardDescription>Warnings and Errors in the last hour</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px] w-full pr-4">
                       {data.recent_events.map((evt, i) => (
                           <div key={i} className="mb-4 last:mb-0 border-l-2 border-yellow-500 pl-4 py-1">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-semibold text-yellow-500">{evt.reason}</span>
                                    <span className="text-xs text-muted-foreground">{format(new Date(evt.timestamp), 'HH:mm')}</span>
                                </div>
                                <p className="text-sm">{evt.message}</p>
                                <p className="text-xs text-muted-foreground mt-1">{evt.object}</p>
                           </div>
                       ))}
                       {data.recent_events.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No recent events.</p>}
                    </ScrollArea>
                  </CardContent>
              </Card>
           </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.application_services.map(svc => (
                    <ServiceCard key={svc.name} service={svc} />
                ))}
             </div>
        </TabsContent>

        <TabsContent value="connectivity" className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Mesh Connectivity Matrix</CardTitle>
                    <CardDescription>Real-time checks between microservices to ensure network policies are correct.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ServiceConnectivityMap matrix={data.connectivity_matrix} />
                </CardContent>
            </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
