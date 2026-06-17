import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  useCreateEngineer,
  useDeleteEngineer,
  useEngineers,
  useGlobalSettings,
  useUpdateEngineer,
  useUpdateGlobalSettings,
} from "@/services/support-api";

export default function SupportSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Support settings"
        description="Manage support engineers and where new-issue alerts go."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/support">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to inbox
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <EngineersCard />
        <GlobalAlertsCard />
      </div>
    </div>
  );
}

function EngineersCard() {
  const engineers = useEngineers();
  const create = useCreateEngineer();
  const update = useUpdateEngineer();
  const remove = useDeleteEngineer();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const add = async () => {
    if (!name.trim() || !email.trim()) return;
    await create.mutateAsync({ name: name.trim(), email: email.trim(), active: true });
    setName("");
    setEmail("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Support engineers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="eng-name">Name</Label>
            <Input id="eng-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="eng-email">Email</Label>
            <Input
              id="eng-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@vacademy.io"
            />
          </div>
          <Button onClick={add} disabled={create.isPending || !name.trim() || !email.trim()}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        <div className="divide-y rounded-md border">
          {engineers.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (engineers.data ?? []).length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No engineers yet.</p>
          ) : (
            (engineers.data ?? []).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {e.assignedInstituteCount ? (
                    <Badge variant="outline" className="text-[10px]">
                      {e.assignedInstituteCount} institute(s)
                    </Badge>
                  ) : null}
                  <Button
                    variant={e.active ? "outline" : "secondary"}
                    size="sm"
                    onClick={() => update.mutate({ id: e.id, payload: { active: !e.active } })}
                  >
                    {e.active ? "Active" : "Inactive"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Remove ${e.name}?`)) remove.mutate(e.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GlobalAlertsCard() {
  const settings = useGlobalSettings();
  const update = useUpdateGlobalSettings();
  const [emails, setEmails] = useState("");

  useEffect(() => {
    if (settings.data) setEmails((settings.data.alertEmails ?? []).join("\n"));
  }, [settings.data]);

  const save = () =>
    update.mutate(
      emails
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global alert emails</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Every new issue (across all institutes) is emailed to these addresses, and a Sentry alert
          fires to the support Slack channel. Per-institute overrides add to this list.
        </p>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={5}
          placeholder="support@vacademy.io&#10;oncall@vacademy.io"
          className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex justify-end">
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save recipients
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
