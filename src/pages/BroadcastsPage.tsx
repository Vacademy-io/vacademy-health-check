import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_TAGS, type LeadTag } from "@/lib/constants";
import { useLeadTagWidgets } from "@/services/widgets-api";
import { WidgetList } from "@/components/widgets/WidgetList";

export default function BroadcastsPage() {
  const [leadTag, setLeadTag] = useState<LeadTag>("PROD");
  const { data, isLoading } = useLeadTagWidgets(leadTag);

  return (
    <div>
      <PageHeader
        title="Broadcasts"
        description="Info cards broadcast to every institute carrying a lead tag (e.g. a maintenance notice to all PROD institutes). Onboarding trackers are per-institute and live on the institute's Widgets tab."
      />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Audience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1">
            <Label>Lead tag</Label>
            <Select value={leadTag} onValueChange={(v) => setLeadTag(v as LeadTag)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_TAGS.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <WidgetList
            widgets={data ?? []}
            isLoading={isLoading}
            target={{ type: "LEAD_TAG", value: leadTag }}
            allowOnboarding={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
