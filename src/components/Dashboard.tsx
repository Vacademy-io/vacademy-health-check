import { useState, useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Activity, Database, Server, AlertCircle, CheckCircle2, XCircle, Search, Network, ArrowRight } from "lucide-react";

import { format } from "date-fns";

import { useServiceLatency } from "@/hooks/useServiceLatency";
import { useInfrastructureHealth } from "@/hooks/useInfrastructureHealth";
import type { PodInfo, K8sComponentStatus } from "@/types/diagnostics";

// --- Components ---

const StatusBadge = ({ status }: { status: string }) => {
  const normStatus = status?.toUpperCase() || "UNKNOWN";
  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  let className = "";
  
  if (["UP", "HEALTHY", "OK", "ACTIVE", "RUNNING"].includes(normStatus)) {
      variant = "outline";
      className = "border-green-500 text-green-600 bg-green-50";
  }
  else if (["DOWN", "FAILED", "ERROR", "CRITICAL", "CRASHLOOPBACKOFF"].includes(normStatus)) {
      variant = "destructive";
  }
  else if (["WARNING", "DEGRADED", "PENDING"].includes(normStatus)) {
      variant = "secondary"; // Yellow-ish usually
      className = "bg-yellow-100 text-yellow-800 hover:bg-yellow-200";
  }

  return <Badge variant={variant} className={className}>{status}</Badge>;
};

const LatencyCard = ({ name, latencyMs, status }: { name: string, latencyMs: number | null, status: string }) => {
    let color = "bg-gray-100 text-gray-500";
    if (status === "UP") {
        if (latencyMs && latencyMs < 200) color = "bg-green-100 text-green-700";
        else if (latencyMs && latencyMs < 800) color = "bg-yellow-100 text-yellow-700";
        else color = "bg-red-100 text-red-700";
    } else if (status === "DOWN") {
        color = "bg-red-100 text-red-700";
    }

    return (
        <div className={`flex flex-col p-3 rounded-lg border ${color} transition-all cursor-pointer hover:opacity-80`}>
            <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-xs uppercase tracking-wider">{name.replace("-service", "")}</span>
                {status === "UP" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            </div>
            <div className="text-2xl font-bold">
                {latencyMs !== null && latencyMs >= 0 ? 
                    `${latencyMs}ms` : 
                    (status === "PENDING" ? "..." : "ERR")
                }
            </div>
            <div className="text-[10px] opacity-80 font-medium">
                {status === "PENDING" ? "Checking..." : (status === "UP" ? (latencyMs && latencyMs < 200 ? "Excellent" : "Fair") : "Critical")}
            </div>
        </div>
    );
};

export default function Dashboard() {
    // 1. Hooks
    const { results: latencyResults, refreshAll: refreshLatency } = useServiceLatency();
    const { data: infraData, loading: infraLoading, lastUpdated, refresh: refreshInfra } = useInfrastructureHealth();

    // 2. State for Deep Dive Table
    const [searchTerm, setSearchTerm] = useState("");
    const [showProblemsOnly, setShowProblemsOnly] = useState(false);
    const [selectedPod, setSelectedPod] = useState<PodInfo | null>(null);

    // 3. Derived Data for Pods
    const allPods = useMemo(() => {
        if (!infraData?.kubernetes_infrastructure) return [];
        const pods: PodInfo[] = [];
        
        Object.values(infraData.kubernetes_infrastructure).forEach((component) => {
             // Check if it's a component with pods
             if ((component as K8sComponentStatus).pods) {
                 (component as K8sComponentStatus).pods?.forEach(p => pods.push(p));
             }
        });
        return pods;
    }, [infraData]);

    const filteredPods = useMemo(() => {
        return allPods.filter(pod => {
            const matchesSearch = pod.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesProblem = showProblemsOnly ? (pod.status !== "Running" || pod.restarts > 0) : true;
            return matchesSearch && matchesProblem;
        });
    }, [allPods, searchTerm, showProblemsOnly]);

    // 4. Render
    if (infraLoading && !infraData) {
         return (
             <div className="flex h-screen w-full items-center justify-center">
                 <div className="flex flex-col items-center gap-4">
                     <RefreshCw className="h-10 w-10 animate-spin text-primary" />
                     <p className="text-muted-foreground animate-pulse">Running System Diagnostics...</p>
                 </div>
             </div>
         );
    }

    // Fallback if data is null (e.g. error)
    if (!infraData) {
        return (
            <div className="p-8 text-center text-red-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                <h2 className="text-xl font-bold">Failed to load diagnostics</h2>
                <Button onClick={() => window.location.reload()} className="mt-4" variant="outline">Retry</Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/50 p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        System Diagnostics
                    </h1>
                    <p className="text-muted-foreground">Real-time health monitoring & availability.</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
                    <span className="text-xs text-muted-foreground tabular-nums px-2">
                        Last Updated: {lastUpdated ? format(lastUpdated, "HH:mm:ss") : "--:--:--"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => { refreshLatency(); refreshInfra(); }}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${infraLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* ZONE 1: THE PULSE (Client-Side Latency) */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <Activity className="h-5 w-5 text-blue-500" />
                    <h2 className="text-lg font-semibold">Client-Side Availability (Pulse)</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {Object.values(latencyResults).map((res) => (
                        <LatencyCard 
                            key={res.service} 
                            name={res.service} 
                            latencyMs={res.pingLatencyMs} 
                            status={res.pingStatus} 
                        />
                    ))}
                    {Object.keys(latencyResults).length === 0 && (
                        <p className="text-sm text-muted-foreground col-span-full">Initializing heartbeat...</p>
                    )}
                </div>
            </section>

            {/* ZONE 2: DATABASE & BACKEND MATRIX */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <Database className="h-5 w-5 text-indigo-500" />
                    <h2 className="text-lg font-semibold">Service Deep Health Matrix</h2>
                </div>
                <Card className="shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Service Name</TableHead>
                                <TableHead>DB Connection</TableHead>
                                <TableHead>DB Latency</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Object.values(latencyResults).map((res) => (
                                <TableRow key={res.service}>
                                    <TableCell className="font-medium">{res.service}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${res.dbStatus === 'UP' ? 'bg-green-500' : 'bg-red-500'}`} />
                                            {res.dbStatus}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {res.dbLatencyMs !== null && res.dbLatencyMs >= 0 ? `${res.dbLatencyMs}ms` : "-"}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={res.pingStatus === 'UP' && res.dbStatus === 'UP' ? 'HEALTHY' : 'DEGRADED'} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            </section>

             {/* ZONE 3: MESH CONNECTIVITY MATRIX */}
             <section>
                 <div className="flex items-center gap-2 mb-4">
                     <Network className="h-5 w-5 text-pink-500" />
                     <h2 className="text-lg font-semibold">Service Mesh Connectivity</h2>
                 </div>
                 {infraData && infraData.connectivity_matrix && infraData.connectivity_matrix.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {infraData.connectivity_matrix.map((conn, idx) => (
                            <Card key={idx} className="p-4 flex flex-col gap-2">
                                <div className="flex items-center justify-between mb-2">
                                <Badge variant="outline" className="text-xs">{conn.source}</Badge>
                                <ArrowRight className="w-4 h-4 text-muted-foreground" />
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
                 ) : (
                     <Card className="p-8 flex flex-col items-center justify-center text-muted-foreground">
                        <Network className="h-8 w-8 mb-2 opacity-20" />
                        <p>No connectivity data available.</p>
                     </Card>
                 )}
            </section>

             {/* ZONE 3: KUBERNETES DEEP DIVE */}
             <section>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Server className="h-5 w-5 text-purple-500" />
                         <h2 className="text-lg font-semibold">Kubernetes Pod Debugger</h2>
                    </div>
                   <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 border rounded-md px-3 py-1 bg-white">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <input 
                                className="text-sm outline-none bg-transparent"
                                placeholder="Filter pods..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Button 
                            variant={showProblemsOnly ? "destructive" : "outline"}
                            size="sm"
                            onClick={() => setShowProblemsOnly(!showProblemsOnly)}
                        >
                            {showProblemsOnly ? "Showing Issues" : "Show Problems Only"}
                        </Button>
                   </div>
                </div>
                
                <Card className="shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Pod Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Restarts</TableHead>
                                <TableHead>Termination Reason</TableHead>
                                <TableHead>Age</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPods.map((pod, i) => (
                                <TableRow key={pod.name + i} className={pod.status !== "Running" ? "bg-red-50/50" : ""}>
                                    <TableCell className="font-medium text-xs">{pod.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            pod.status === "Running" ? "border-green-500 text-green-600" : "border-red-500 text-red-600 bg-red-50"
                                        }>
                                            {pod.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <span className={pod.restarts > 5 ? "text-red-600 font-bold" : ""}>{pod.restarts}</span>
                                    </TableCell>
                                    <TableCell>
                                        {pod.termination_reason ? (
                                             <div className="flex flex-col">
                                                 <span className="text-xs font-bold text-red-600">{pod.termination_reason}</span>
                                                 {pod.last_exit_code && <span className="text-[10px] text-muted-foreground">Code: {pod.last_exit_code}</span>}
                                             </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{pod.age}</TableCell>
                                    <TableCell className="text-right">
                                        {pod.logs && pod.logs.length > 0 && (
                                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedPod(pod)}>
                                                View Logs
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredPods.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No Pods found matching filters.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>
            </section>

             {/* Logs Dialog */}
             <Dialog open={!!selectedPod} onOpenChange={(open) => !open && setSelectedPod(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                             <AlertCircle className="h-5 w-5 text-red-500" />
                             Crash Logs: <span className="font-mono text-sm bg-slate-100 px-2 rounded">{selectedPod?.name}</span>
                        </DialogTitle>
                        <DialogDescription>
                            Most recent logs from the terminated container.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="flex-1 w-full rounded-md border bg-slate-950 p-4">
                        <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap leading-relaxed">
                            {selectedPod?.logs?.join("\n") || "No logs available."}
                        </pre>
                    </ScrollArea>
                </DialogContent>
             </Dialog>

        </div>
    );
}
