import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAlertTemplate,
  useRegisterAlertTemplate,
  useTestSignupAlert,
  type AlertResult,
} from "@/services/products-api";
import { errorText } from "./errors";

const VARIABLES = [
  ["{{1}}", "Product"],
  ["{{2}}", "Name"],
  ["{{3}}", "Institute"],
  ["{{4}}", "Email"],
  ["{{5}}", "Phone"],
  ["{{6}}", "Signed up with"],
  ["{{7}}", "Trial ends"],
];

/** Meta may keep a registered template unusable: this is what can be sent, and what cannot. */
const templateBadge = (status: string) => {
  if (status === "APPROVED") return <Badge variant="secondary">Approved</Badge>;
  if (status === "NOT_REGISTERED") return <Badge variant="outline">Not registered</Badge>;
  if (status === "PENDING") return <Badge variant="outline">Waiting for Meta</Badge>;
  return <Badge variant="destructive">{status}</Badge>;
};

/** The WhatsApp template, and a test alert. Recipients are edited with the product's settings. */
export function ProductAlertsSection({
  productKey,
  hasWabaId,
  dirty,
}: {
  productKey: string;
  hasWabaId: boolean;
  dirty: boolean;
}) {
  const template = useAlertTemplate(productKey);
  const register = useRegisterAlertTemplate(productKey);
  const test = useTestSignupAlert(productKey);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AlertResult | null>(null);
  const status = template.data?.status;
  const locked = status === "APPROVED" || status === "PENDING";

  useEffect(() => {
    if (template.data?.body) setBody(template.data.body);
  }, [template.data?.body]);

  const submit = () => {
    setError(null);
    register.mutate(body, { onError: (e) => setError(errorText(e, "Meta did not accept the template.")) });
  };
  const sendTest = () => {
    setError(null);
    setResult(null);
    test.mutate(undefined, {
      onSuccess: setResult,
      onError: (e) => setError(errorText(e, "The test alert could not be sent.")),
    });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">WhatsApp template</h4>
          <p className="text-xs text-muted-foreground">
            On the Vidyayatan Technologies account. Name: <code>{template.data?.name ?? "..."}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status && templateBadge(status)}
          <Button
            variant="ghost"
            size="sm"
            aria-label="Refresh template status"
            onClick={() => void template.refetch()}
            disabled={template.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${template.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {template.isError && (
        <p role="alert" className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {errorText(template.error, "The template status could not be read.")}
        </p>
      )}
      {template.data?.rejected_reason && template.data.rejected_reason !== "NONE" && (
        <p role="alert" className="text-sm text-destructive">
          Meta's reason: {template.data.rejected_reason}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`template-body-${productKey}`}>Message</Label>
        <Textarea
          id={`template-body-${productKey}`}
          rows={9}
          value={body}
          readOnly={locked}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {VARIABLES.map(([key, label]) => `${key} ${label}`).join(" · ")}. All seven are needed: every product sends
          them.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!locked && (
          <Button onClick={submit} disabled={!hasWabaId || dirty || register.isPending || !body.trim()}>
            {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register with Meta
          </Button>
        )}
        <Button variant="outline" onClick={sendTest} disabled={dirty || test.isPending}>
          {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send test alert
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Save your changes first.</span>}
        {!dirty && !hasWabaId && !locked && (
          <span className="text-xs text-muted-foreground">Save the WhatsApp Business Account id first.</span>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}
      {result && (
        <ul className="space-y-1 text-sm" aria-label="Test alert result">
          {result.deliveries.length === 0 && (
            <li className="text-muted-foreground">No one is on the alert list yet.</li>
          )}
          {result.deliveries.map((d) => (
            <li key={`${d.channel}-${d.to}`} className={`flex items-start gap-1 ${d.sent ? "" : "text-destructive"}`}>
              {d.sent ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span className="min-w-0 break-words">
                {d.channel === "EMAIL" ? "Email" : "WhatsApp"} {d.to}: {d.sent ? "sent" : d.error}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
