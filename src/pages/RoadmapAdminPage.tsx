import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRoadmap, useUpdateRoadmap } from "@/services/roadmap-api";

export default function RoadmapAdminPage() {
  const roadmap = useRoadmap();
  const update = useUpdateRoadmap();
  const [html, setHtml] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (roadmap.data && !dirty) setHtml(roadmap.data.htmlContent);
    // Only seed from the server once per load; further server refetches shouldn't clobber
    // in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmap.data]);

  const save = () => {
    update.mutate(html, { onSuccess: () => setDirty(false) });
  };

  return (
    <div>
      <PageHeader
        title="Roadmap"
        description="What admins see when they open Roadmap from the right rail — paste the HTML and publish."
        actions={
          <Button size="sm" onClick={save} disabled={update.isPending || roadmap.isLoading}>
            {update.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Publish
          </Button>
        }
      />

      {roadmap.data?.updatedAt ? (
        <p className="mb-4 -mt-2 text-xs text-muted-foreground">
          Last published {new Date(roadmap.data.updatedAt).toLocaleString()}
        </p>
      ) : null}

      {update.isSuccess && !dirty ? (
        <p className="mb-4 text-xs font-medium text-green-600">Published — admins will see a "new" badge next time they load the dashboard.</p>
      ) : null}
      {update.isError ? (
        <p className="mb-4 text-xs font-medium text-destructive">Could not publish. Try again.</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">HTML</CardTitle>
          </CardHeader>
          <CardContent>
            {roadmap.isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Textarea
                value={html}
                onChange={(e) => {
                  setHtml(e.target.value);
                  setDirty(true);
                }}
                placeholder="<h1>What's coming</h1>\n<p>...</p>"
                className="min-h-[420px] font-mono text-xs"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[420px] overflow-hidden rounded-md border bg-muted/30">
              <iframe
                title="Roadmap preview"
                srcDoc={html}
                className="size-full border-0"
                sandbox="allow-scripts allow-popups"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
