import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInstituteDetail, useGrantCredits, useDeductCredits, useUpdateLeadTag } from "@/services/institutes-api";
import { useInstituteCourses } from "@/services/courses-api";
import { useInstituteUsers, useDeactivateUser } from "@/services/users-api";
import { useInstituteSessions } from "@/services/sessions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  BookOpen,
  Layers,
  ArrowLeft,
  CreditCard,
  Minus,
  UserX,
} from "lucide-react";
import { LEAD_TAG_OPTIONS } from "@/types/api";
import type {
  InstituteCourseDTO,
  InstituteUserDTO,
  InstituteSessionDTO,
  LeadTag,
} from "@/types/api";

const TAG_COLORS: Record<string, string> = {
  PROD: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  LEAD: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  TEST: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  FREE_TRIAL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export default function InstituteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: institute, isLoading } = useInstituteDetail(id!);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!institute) {
    return <p className="text-muted-foreground">Institute not found.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={institute.name || "Institute Detail"}
        description={[institute.email, institute.subdomain].filter(Boolean).join(" | ")}
        actions={
          <div className="flex items-center gap-2">
            <LeadTagSelector instituteId={id!} currentTag={institute.lead_tag} />
            <Button variant="outline" size="sm" onClick={() => navigate("/institutes")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </div>
        }
      />

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Students" value={institute.student_count} icon={Users} />
        <StatCard title="Courses" value={institute.course_count} icon={BookOpen} />
        <StatCard title="Batches" value={institute.batch_count} icon={Layers} />
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Profile Completion</p>
            <p className="mt-1 text-2xl font-bold">{institute.profile_completion_percentage}%</p>
            <Progress value={institute.profile_completion_percentage} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab institute={institute} />
        </TabsContent>
        <TabsContent value="courses" className="mt-4">
          <CoursesTab instituteId={id!} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab instituteId={id!} />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsTab instituteId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LeadTagSelector({ instituteId, currentTag }: { instituteId: string; currentTag: LeadTag | null }) {
  const mutation = useUpdateLeadTag(instituteId);

  return (
    <Select
      value={currentTag || "PROD"}
      onValueChange={(v) => mutation.mutate(v as LeadTag)}
      disabled={mutation.isPending}
    >
      <SelectTrigger className={`w-32 ${TAG_COLORS[currentTag || "PROD"] || ""}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAD_TAG_OPTIONS.map((tag) => (
          <SelectItem key={tag} value={tag}>
            {tag}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OverviewTab({ institute }: { institute: NonNullable<ReturnType<typeof useInstituteDetail>["data"]> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Institute Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <InfoRow label="ID" value={institute.id} />
          <InfoRow label="Type" value={institute.type} />
          <InfoRow label="Tag" value={institute.lead_tag} />
          <InfoRow label="City" value={institute.city} />
          <InfoRow label="State" value={institute.state} />
          <InfoRow label="Subdomain" value={institute.subdomain} />
          <InfoRow
            label="Created"
            value={institute.created_at ? new Date(institute.created_at).toLocaleDateString() : "-"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Credits</CardTitle>
          <div className="flex items-center gap-2">
            <GrantCreditsDialog instituteId={institute.id} />
            <DeductCreditsDialog instituteId={institute.id} />
          </div>
        </CardHeader>
        <CardContent>
          {institute.credit_balance && Object.keys(institute.credit_balance).length > 0 ? (
            <div className="space-y-2 text-sm">
              {Object.entries(institute.credit_balance).map(([key, val]) => (
                <InfoRow key={key} label={key} value={String(val)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No credit data</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value || "-"}</span>
    </div>
  );
}

function GrantCreditsDialog({ instituteId }: { instituteId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const mutation = useGrantCredits(instituteId);

  async function handleSubmit() {
    if (!amount) return;
    await mutation.mutateAsync({ amount: Number(amount), description });
    setOpen(false);
    setAmount("");
    setDescription("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CreditCard className="mr-2 h-4 w-4" /> Grant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Credits</DialogTitle>
          <DialogDescription>Add credits to this institute's balance.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Monthly allocation"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || !amount}>
            {mutation.isPending ? "Granting..." : "Grant Credits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeductCreditsDialog({ instituteId }: { instituteId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const mutation = useDeductCredits(instituteId);

  async function handleSubmit() {
    if (!amount) return;
    await mutation.mutateAsync({ amount: Number(amount), description });
    setOpen(false);
    setAmount("");
    setDescription("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <Minus className="mr-2 h-4 w-4" /> Deduct
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deduct Credits</DialogTitle>
          <DialogDescription>Remove credits from this institute's balance.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50.00"
            />
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Credit adjustment"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={mutation.isPending || !amount}>
            {mutation.isPending ? "Deducting..." : "Deduct Credits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoursesTab({ instituteId }: { instituteId: string }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useInstituteCourses(instituteId, page, 20, search);

  const columns: Column<InstituteCourseDTO & Record<string, unknown>>[] = [
    { key: "package_name", header: "Name", render: (r) => <span className="font-medium">{r.package_name}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>{r.status}</Badge>
      ),
    },
    { key: "chapter_count", header: "Chapters", className: "text-right" },
    { key: "student_count", header: "Students", className: "text-right" },
    { key: "batch_count", header: "Batches", className: "text-right" },
    {
      key: "created_at",
      header: "Created",
      render: (r) => (r.created_at ? new Date(r.created_at as string).toLocaleDateString() : "-"),
    },
  ];

  return (
    <DataTable
      data={(data?.content as (InstituteCourseDTO & Record<string, unknown>)[]) ?? []}
      columns={columns}
      page={page}
      totalPages={data?.total_pages ?? 0}
      totalItems={data?.total_elements}
      onPageChange={setPage}
      isLoading={isLoading}
      toolbar={
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Search courses..." />
      }
    />
  );
}

function UsersTab({ instituteId }: { instituteId: string }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const { data, isLoading } = useInstituteUsers(instituteId, page, 20, role, search);
  const deactivateMutation = useDeactivateUser(instituteId);
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);

  function handleDeactivate(userId: string) {
    deactivateMutation.mutate(userId, {
      onSuccess: () => setConfirmUserId(null),
    });
  }

  const columns: Column<InstituteUserDTO & Record<string, unknown>>[] = [
    { key: "full_name", header: "Name", render: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: "email", header: "Email" },
    {
      key: "roles",
      header: "Roles",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {String(r.roles || "")
            .split(",")
            .filter(Boolean)
            .map((role) => (
              <Badge key={role} variant="outline" className="text-xs">
                {role.trim()}
              </Badge>
            ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>{r.status}</Badge>,
    },
    {
      key: "last_login_time",
      header: "Last Login",
      render: (r) => (r.last_login_time ? new Date(r.last_login_time as string).toLocaleString() : "-"),
    },
    {
      key: "actions",
      header: "",
      render: (r) => {
        const roles = String(r.roles || "").toUpperCase();
        const isNonStudent = roles.includes("ADMIN") || roles.includes("TEACHER") || roles.includes("EVALUATOR");
        if (!isNonStudent || r.status !== "ACTIVE") return null;

        return (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmUserId(r.user_id);
            }}
          >
            <UserX className="h-4 w-4" />
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        data={(data?.content as (InstituteUserDTO & Record<string, unknown>)[]) ?? []}
        columns={columns}
        page={page}
        totalPages={data?.total_pages ?? 0}
        totalItems={data?.total_elements}
        onPageChange={setPage}
        isLoading={isLoading}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Search users..." />
            <Select value={role} onValueChange={(v) => { setRole(v === "ALL" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="TEACHER">Teacher</SelectItem>
                <SelectItem value="STUDENT">Student</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Confirm deactivation dialog */}
      <Dialog open={!!confirmUserId} onOpenChange={() => setConfirmUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate this user from this institute? They will lose access to their admin/teacher role.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUserId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmUserId && handleDeactivate(confirmUserId)}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? "Removing..." : "Remove User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SessionsTab({ instituteId }: { instituteId: string }) {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useInstituteSessions(instituteId, page, 20);

  const columns: Column<InstituteSessionDTO & Record<string, unknown>>[] = [
    { key: "user_id", header: "User ID", render: (r) => <span className="max-w-[120px] truncate text-xs">{r.user_id}</span> },
    { key: "device_type", header: "Device" },
    { key: "ip_address", header: "IP" },
    {
      key: "is_active",
      header: "Status",
      render: (r) => (
        <Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Ended"}</Badge>
      ),
    },
    {
      key: "login_time",
      header: "Login Time",
      render: (r) => (r.login_time ? new Date(r.login_time as string).toLocaleString() : "-"),
    },
    {
      key: "session_duration_minutes",
      header: "Duration",
      className: "text-right",
      render: (r) => (r.session_duration_minutes != null ? `${r.session_duration_minutes} min` : "-"),
    },
  ];

  return (
    <DataTable
      data={(data?.content as (InstituteSessionDTO & Record<string, unknown>)[]) ?? []}
      columns={columns}
      page={page}
      totalPages={data?.total_pages ?? 0}
      totalItems={data?.total_elements}
      onPageChange={setPage}
      isLoading={isLoading}
    />
  );
}
