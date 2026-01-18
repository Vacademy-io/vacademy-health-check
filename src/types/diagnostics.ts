
export interface HealthResponse {
  timestamp: string;
  overall_status: string;
  kubernetes_infrastructure: {
    ingress_nginx: K8sComponentStatus;
    // Allow other dynamics
    [key: string]: K8sComponentStatus | LoadBalancerStatus | any;
  };
  application_services: ServiceStatus[];
  dependencies: {
    redis: DependencyStatus;
    postgresql: DatabaseStatus;
  };
  connectivity_matrix: ConnectivityCheck[];
  recent_events: K8sEvent[];
}

export interface K8sComponentStatus {
  status: string;
  ready_replicas?: number;
  total_replicas?: number;
  restart_count?: number;
  pods?: PodInfo[];
}

export interface LoadBalancerStatus {
  status: string;
  external_ip: string;
  ports?: string[];
}

export interface PodInfo {
  name: string;
  status: string;
  ready: boolean;
  restarts: number;
  age: string;
  node?: string;
  namespace?: string;
  termination_reason?: string; 
  last_exit_code?: number;
  logs?: string[];
}

export interface ServiceStatus {
  name: string;
  status: string;
  response_time_ms: number;
  health_endpoint?: string;
  last_check?: string;
}

export interface DependencyStatus {
  status: string;
  connected: boolean;
  response_time_ms: number;
  host?: string;
  port?: number;
  database_name?: string;
}

export interface DatabaseStatus extends DependencyStatus {
  url?: string;
}

export interface ConnectivityCheck {
  source: string;
  target: string;
  status: string;
  response_time_ms: number;
  error_message?: string;
  last_check?: string;
}

export interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  object: string;
  namespace?: string;
  timestamp: string;
  count?: number;
}
