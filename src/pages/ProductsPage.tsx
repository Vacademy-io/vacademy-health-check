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
import { ProductPlansSection } from "@/components/products/ProductPlansSection";
import { ProductOnlineSale } from "@/components/products/ProductOnlineSale";
import { newPlans, plansNeedSync, plansProblem } from "@/components/products/plans";
import { ProductPricingTab } from "@/components/products/ProductPricingTab";
import { ProductSignupsTab } from "@/components/products/ProductSignupsTab";
import { useProducts, useUpdateProduct, type ProductConfig } from "@/services/products-api";
import { useProductStorefront, useSyncProductPlans, type ProductStorefront } from "@/services/product-plans-api";

type Status = { kind: "saved" | "error"; text: string } | null;

const MAX_SIGNUP_CREDITS = 100000;

/** Empty only while it has never been set: the server keeps the old number if it is sent empty. */
const signupCreditsValid = (value: number | null, saved: number | null) =>
  value == null ? saved == null : Number.isInteger(value) && value >= 0 && value <= MAX_SIGNUP_CREDITS;

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
  const storefront = useProductStorefront(product.product_key);
  const sync = useSyncProductPlans(product.product_key);
  const [picked, setFeatures] = useState<string[] | null>(null);
  const [migrate, setMigrate] = useState(false);
  // Plans go on sale only from the Pricing tab: Save on another tab saves just the settings, as before.
  const [tab, setTab] = useState("signups");

  useEffect(() => setForm(product), [product]);
  // Until someone ticks, new plans' credits pay for what the product's plans on sale already cover.
  const features =
    picked ?? [...new Set((storefront.data?.plans ?? []).flatMap((p) => p.published?.features ?? []))];

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
  const creditsValid =
    signupCreditsValid(form.demo_credits, product.demo_credits) &&
    signupCreditsValid(form.demo_portal_credits ?? null, product.demo_portal_credits ?? null);
  const plansValid = plansProblem(form.plans, form.plan_validity_months, form.extra_credit_price_inr) === null;
  // The storefront must sell what the form says; null = this ai-service cannot (not deployed yet).
  const needsSync =
    tab === "pricing" && !!storefront.data && plansNeedSync(form.plans, storefront.data.plans, form.plan_validity_months);
  const syncValid = !needsSync || newPlans(form.plans, storefront.data?.plans).length === 0 || features.length > 0;
  const busy = update.isPending || sync.isPending;

  const describe = (out: ProductStorefront) => {
    const n = out.changes?.length ?? 0;
    return n ? ` Plans on sale updated (${n} change${n === 1 ? "" : "s"}).` : "";
  };
  const syncPlans = (prefix: string) =>
    sync.mutate(
      {
        plans: (form.plans ?? []).map((p) => ({ key: p.key.trim(), name: p.name.trim(), price_inr: p.price_inr, credits: p.credits })),
        period_months: form.plan_validity_months ?? 12,
        allowance_features: features,
        migrate_existing_at_renewal: migrate,
        reason: `Products → ${product.display_name} → Pricing`,
      },
      {
        onSuccess: (out) => setStatus({ kind: "saved", text: `${prefix}${describe(out)}` }),
        onError: (error) =>
          setStatus({ kind: "error", text: `${prefix} But the plans on sale were not updated: ${errorText(error)}` }),
      }
    );

  const save = () => {
    if (!dirty) return needsSync && syncPlans("Settings unchanged.");
    update.mutate(form, {
      onSuccess: () => {
        const done = "Saved. Every service picks it up within a minute.";
        if (needsSync) syncPlans(done);
        else setStatus({ kind: "saved", text: done });
      },
      onError: (error) => setStatus({ kind: "error", text: errorText(error) }),
    });
  };

  const saveRow = (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={save}
            disabled={(!dirty && !needsSync) || !creditsValid || !plansValid || !syncValid || busy}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            setStatus(null);
          }}
        >
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
            <ProductPricingTab>
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">New sign-up credits</h3>
                  <p className="text-xs text-muted-foreground">
                    What each new {product.display_name} institute opens with. Institutes that have already signed up
                    keep their credits.
                  </p>
                </div>
                <div className="max-w-xs">
                  <Field label="Credits for each new sign-up">
                    <Input
                      type="number"
                      min={0}
                      max={MAX_SIGNUP_CREDITS}
                      step={1}
                      aria-label="Credits for each new sign-up"
                      value={form.demo_credits ?? ""}
                      onChange={(e) => set("demo_credits", e.target.value === "" ? null : Number(e.target.value))}
                    />
                  </Field>
                </div>
                <div className="max-w-xs">
                  <Field
                    label="Credits on the demo page"
                    hint="The one-screen demo (/demo: name, email, phone, no code). Empty uses the number above."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={MAX_SIGNUP_CREDITS}
                      step={1}
                      aria-label="Credits on the demo page"
                      value={form.demo_portal_credits ?? ""}
                      onChange={(e) =>
                        set("demo_portal_credits", e.target.value === "" ? null : Number(e.target.value))
                      }
                    />
                  </Field>
                </div>
                <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                  <Field
                    label="Demo leads go to institute"
                    hint="Institute id whose CRM gets every demo-page sign-up as a lead. Saving creates the list."
                  >
                    <Input
                      aria-label="Demo leads institute id"
                      placeholder="ca3c4734-…"
                      value={form.demo_leads_institute_id ?? ""}
                      onChange={(e) => set("demo_leads_institute_id", e.target.value)}
                    />
                  </Field>
                  <Field label="Demo leads list name" hint={`Empty: "Product ${product.display_name} ( Instant - Demo )"`}>
                    <Input
                      aria-label="Demo leads list name"
                      value={form.demo_leads_list_name ?? ""}
                      onChange={(e) => set("demo_leads_list_name", e.target.value)}
                    />
                  </Field>
                </div>
                {creditsValid ? (
                  <p className="text-sm text-muted-foreground">
                    {product.demo_credits == null
                      ? "Now: not set, so new sign-ups get the platform's default."
                      : `Now: ${product.demo_credits.toLocaleString()} credits for each new sign-up.`}
                  </p>
                ) : (
                  <p role="alert" className="text-sm text-destructive">
                    Enter a whole number from 0 to {MAX_SIGNUP_CREDITS.toLocaleString()}.
                  </p>
                )}
              </section>
              <ProductPlansSection
                displayName={product.display_name}
                plans={form.plans}
                months={form.plan_validity_months}
                extra={form.extra_credit_price_inr}
                onChange={(patch) => {
                  setForm((f) => ({ ...f, ...patch }));
                  setStatus(null);
                }}
                onlineSale={
                  <ProductOnlineSale
                    displayName={product.display_name}
                    plans={form.plans ?? []}
                    months={form.plan_validity_months}
                    extra={form.extra_credit_price_inr}
                    storefront={storefront.data}
                    loading={storefront.isLoading}
                    features={features}
                    onFeatures={setFeatures}
                    migrate={migrate}
                    onMigrate={setMigrate}
                    onExtra={(v) => {
                      setForm((f) => ({ ...f, extra_credit_price_inr: v }));
                      setStatus(null);
                    }}
                    onRefresh={() => void storefront.refetch()}
                  />
                }
                saveRow={saveRow}
              />
            </ProductPricingTab>
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
            <Field label="Logo in emails" hint="Public https PNG or JPG (SVG does not show in Gmail). Empty: a letter tile.">
              <Input aria-label="Logo in emails" placeholder="https://evalezy.com/icon-192.png" {...text("email_logo_url")} />
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
