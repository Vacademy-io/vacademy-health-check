import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { errorText } from "@/components/products/errors";
import { ProductAlertsSection } from "@/components/products/ProductAlertsSection";
import { ProductPricingTab } from "@/components/products/ProductPricingTab";
import { ProductSignupsTab } from "@/components/products/ProductSignupsTab";
import { useProducts, useUpdateProduct, type ProductConfig } from "@/services/products-api";

type Status = { kind: "saved" | "error"; text: string } | null;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProductCard({ product }: { product: ProductConfig }) {
  const [form, setForm] = useState(product);
  const [status, setStatus] = useState<Status>(null);
  const update = useUpdateProduct();

  useEffect(() => setForm(product), [product]);

  const set = <K extends keyof ProductConfig>(key: K, value: ProductConfig[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus(null);
  };
  const text = (key: keyof ProductConfig) => ({
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, e.target.value as ProductConfig[typeof key]),
  });
  const dirty = JSON.stringify(form) !== JSON.stringify(product);

  const save = () =>
    update.mutate(form, {
      onSuccess: () => setStatus({ kind: "saved", text: "Saved. Every service picks it up within a minute." }),
      onError: (error) => setStatus({ kind: "error", text: errorText(error) }),
    });

  const saveRow = (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
          {status && (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              className={`flex items-center gap-1 text-sm ${status.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {status.kind === "error" ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {status.text}
            </p>
          )}
        </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{product.display_name}</CardTitle>
          <Badge variant={product.self_signup_enabled ? "secondary" : "outline"}>
            {product.self_signup_enabled ? "Sign-up open" : "Sign-up closed"}
          </Badge>
        </div>
        <CardDescription>
          Key: <code>{product.product_key}</code>
          {product.updated_at
            ? ` · Last changed ${new Date(product.updated_at).toLocaleString()}${product.updated_by ? ` by ${product.updated_by}` : ""}`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="signups">
          <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
            <TabsTrigger value="signups">Sign-ups</TabsTrigger>
            <TabsTrigger value="settings">Trial and mail</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
          </TabsList>
          <TabsContent value="signups">
            <ProductSignupsTab productKey={product.product_key} />
          </TabsContent>
          <TabsContent value="pricing">
            <ProductPricingTab />
          </TabsContent>
          <TabsContent value="alerts" className="space-y-6">
            <section className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Who hears about each new sign-up. A failed alert never affects the sign-up.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Alert emails" hint="Comma-separated. Sent from this product's mail sender.">
                  <Textarea
                    rows={3}
                    aria-label="Alert emails"
                    value={form.signup_alert_emails ?? ""}
                    onChange={(e) => set("signup_alert_emails", e.target.value)}
                  />
                </Field>
                <Field label="Alert WhatsApp numbers" hint="Comma-separated, with the country code: 919876543210.">
                  <Textarea
                    rows={3}
                    aria-label="Alert WhatsApp numbers"
                    value={form.signup_alert_whatsapp ?? ""}
                    onChange={(e) => set("signup_alert_whatsapp", e.target.value)}
                  />
                </Field>
                <Field
                  label="WhatsApp Business Account id"
                  hint="Of the Vidyayatan Technologies account. Needed to register the template."
                >
                  <Input aria-label="WhatsApp Business Account id" {...text("whatsapp_waba_id")} />
                </Field>
                <Field label="Template name" hint="Empty uses product_signup_alert. Language: en.">
                  <Input aria-label="Template name" {...text("signup_alert_template")} />
                </Field>
              </div>
              {saveRow}
            </section>
            <ProductAlertsSection
              productKey={product.product_key}
              hasWabaId={!!product.whatsapp_waba_id}
              dirty={dirty}
            />
          </TabsContent>
          <TabsContent value="settings" className="space-y-6">
        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Mail sender</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="From email"
              hint="Its domain must be verified in SES, or the OTP and welcome mail will not be delivered."
            >
              <Input type="email" aria-label="From email" {...text("from_email")} />
            </Field>
            <Field label="From name" hint="The name people see in their inbox.">
              <Input aria-label="From name" {...text("from_name")} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Sign-up and trial</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label="Self sign-up open"
              checked={form.self_signup_enabled}
              onChange={(e) => set("self_signup_enabled", e.target.checked)}
            />
            Anyone can sign up and start a trial
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Trial days" hint="Applies to new sign-ups. Running trials keep their end date.">
              <Input
                type="number"
                min={0}
                max={365}
                aria-label="Trial days"
                value={form.trial_days}
                onChange={(e) => set("trial_days", Number(e.target.value))}
              />
            </Field>
            <Field
              label="Demo credits"
              hint="What each new institute of this product opens with. If never set, it gets the platform's default."
            >
              <Input
                type="number"
                min={0}
                max={100000}
                aria-label="Demo credits"
                value={form.demo_credits ?? ""}
                onChange={(e) => set("demo_credits", e.target.value === "" ? null : Number(e.target.value))}
              />
            </Field>
            <Field label="App path" hint="Where people land after signing up.">
              <Input aria-label="App path" {...text("app_path")} />
            </Field>
            <Field label="Login URL" hint="The login link in the welcome mail. Empty keeps the platform's.">
              <Input aria-label="Login URL" {...text("login_url")} />
            </Field>
            <Field
              label="Sign-up return hosts"
              hint="Comma-separated. Google sign-in only hands its proof to these hosts and their subdomains."
            >
              <Input aria-label="Sign-up return hosts" {...text("return_hosts")} />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Branding</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Product name">
              <Input aria-label="Product name" {...text("display_name")} />
            </Field>
            <Field label="Website">
              <Input aria-label="Website" {...text("website_url")} />
            </Field>
            <Field label="Contact email" hint="Shown in the footer of the OTP mail.">
              <Input type="email" aria-label="Contact email" {...text("contact_email")} />
            </Field>
            <Field label="Theme colour">
              <Input aria-label="Theme colour" placeholder="#D61C28" {...text("theme_color")} />
            </Field>
            <Field label="Logo URL">
              <Input aria-label="Logo URL" {...text("logo_url")} />
            </Field>
          </div>
        </section>

        {saveRow}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** Products sold under their own name: who their mail comes from, their trial and sign-up. */
export default function ProductsPage() {
  const products = useProducts();
  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="Sign-ups, trials, alerts and pricing for each product." />
      {products.isLoading && <Skeleton className="h-96 w-full" />}
      {products.isError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> The products could not be loaded.
          <Button variant="outline" size="sm" onClick={() => void products.refetch()}>
            Try again
          </Button>
        </p>
      )}
      {products.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No products are set up yet.</p>
      )}
      {products.data?.map((product) => <ProductCard key={product.product_key} product={product} />)}
    </div>
  );
}
