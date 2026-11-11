import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useKeyAccounts,
  useOpenRouterCheck,
  useSaveKeyDetails,
  type OwnerSource,
  type PlatformKeyRow,
} from "@/services/external-apis-api";
import { instituteKeyKind, keyLabel, serviceName, vendorName } from "./format";
import { EmptyNote, ErrorNote, Highlights, Tiles } from "./parts";

const SOURCE_LABELS: Record<OwnerSource, string> = {
  stored: "Recorded on the key",
  declared: "Entered by staff",
  unknown: "Not known",
};

const UNIT_LABELS: Record<string, string> = {
  credit: "per credit",
  "1000_credits": "per 1,000 credits",
  request: "per request",
  "1000_requests": "per 1,000 requests",
  month: "per month",
  other: "other",
};

const configuredLabel = (configured: boolean | null) =>
  configured == null ? "Can't be checked from here" : configured ? "Set up" : "Not set up";

const priceLabel = (row: PlatformKeyRow) =>
  row.price == null ? null : `${row.currency} ${row.price} ${UNIT_LABELS[row.price_unit ?? ""] ?? ""}`.trim();

function OpenRouterCheck({ hint }: { hint: string }) {
  const check = useOpenRouterCheck();
  if (check.data) {
    return (
      <p className="text-xs text-muted-foreground">
        OpenRouter account: {check.data.creator_user_id ?? "not reported"}
        {check.data.usage_monthly != null && ` · $${check.data.usage_monthly.toFixed(2)} this month`}
        {check.data.limit != null && ` · limit $${check.data.limit}`}
      </p>
    );
  }
  return (
    <div>
      <Button variant="outline" size="sm" disabled={check.isPending} onClick={() => check.mutate(hint)}>
        {check.isPending ? "Asking OpenRouter" : "Ask OpenRouter"}
      </Button>
      {check.isError && <p className="mt-1 text-xs text-red-700">Check failed</p>}
    </div>
  );
}

function DetailsDialog({ row, units, currencies, onClose }: {
  row: PlatformKeyRow;
  units: string[];
  currencies: string[];
  onClose: () => void;
}) {
  const accountFromKey = row.owner_source === "stored";
  const [account, setAccount] = useState(accountFromKey ? "" : row.owner ?? "");
  const [price, setPrice] = useState(row.price == null ? "" : String(row.price));
  const [unit, setUnit] = useState(row.price_unit ?? "");
  const [currency, setCurrency] = useState(row.currency ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const save = useSaveKeyDetails();

  const priceNumber = Number(price);
  const hasPrice = price.trim() !== "";
  const priceProblem = !hasPrice
    ? null
    : !Number.isFinite(priceNumber) || priceNumber < 0
      ? "Enter a price of 0 or more"
      : !unit
        ? "Choose what the price is per"
        : !currency
          ? "Choose a currency"
          : null;

  const submit = () =>
    save.mutate(
      {
        details_key: row.details_key,
        account: accountFromKey ? null : account,
        price: hasPrice ? priceNumber : null,
        price_unit: hasPrice ? unit : null,
        currency: hasPrice ? currency : null,
        notes,
      },
      { onSuccess: onClose },
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{vendorName(row.vendor)} details</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {row.key_hint ? `Key ending …${row.key_hint}` : keyLabel(row.credential)}. These are entered by hand and not checked with the vendor. Never paste a key here.
          </p>
          <div className="space-y-1">
            <Label htmlFor="key-account">Account</Label>
            {accountFromKey ? (
              <p className="text-sm">{row.owner} <span className="text-xs text-muted-foreground">(recorded on the key)</span></p>
            ) : (
              <Input id="key-account" value={account} maxLength={200} placeholder="Account name or email" onChange={(e) => setAccount(e.target.value)} />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="key-price">Price</Label>
              <Input id="key-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Per</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger aria-label="Price unit"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => <SelectItem key={u} value={u}>{UNIT_LABELS[u] ?? u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Currency"><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Only Serper calls are logged today, so only a Serper key's price produces a cost per call, and only for new calls and per-credit or per-request prices. Other prices are kept for reference.
          </p>
          <div className="space-y-1">
            <Label htmlFor="key-notes">Notes</Label>
            <Textarea id="key-notes" value={notes} maxLength={500} placeholder="Plan, renewal date, who to ask" onChange={(e) => setNotes(e.target.value)} />
          </div>
          {priceProblem && <p className="text-xs text-red-700">{priceProblem}</p>}
          {save.isError && <ErrorNote title="Could not save" error={save.error} />}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={save.isPending || !!priceProblem} onClick={submit}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function KeyAccountsTab() {
  const accounts = useKeyAccounts();
  const [editing, setEditing] = useState<PlatformKeyRow | null>(null);

  if (accounts.isError) {
    return <ErrorNote title="Could not load keys and accounts" error={accounts.error} onRetry={() => accounts.refetch()} />;
  }
  if (accounts.isLoading || !accounts.data) return <Skeleton className="h-96 w-full" />;

  const { platform_keys: platform, institute_keys: institute, price_units: units, currencies } = accounts.data;
  const known = platform.filter((r) => r.owner).length;
  const priced = platform.filter((r) => r.price != null).length;
  const set = platform.filter((r) => r.configured === true).length;
  const missing = platform.filter((r) => r.configured === false);
  const unknownOwner = platform.filter((r) => r.configured !== false && !r.owner);
  const instituteCount = new Set(institute.map((r) => r.institute_id)).size;

  return (
    <div className="space-y-6">
      <Tiles
        items={[
          { label: "Our keys set up", value: `${set} of ${platform.length}`, note: missing.length ? `${missing.length} not set up` : "All set up" },
          { label: "Account known", value: `${known} of ${platform.length}`, note: "Whose vendor account each key bills", tone: unknownOwner.length ? "warn" : undefined },
          { label: "Price entered", value: `${priced} of ${platform.length}`, note: "Needed to cost the calls we log" },
          { label: "Institutes with their own keys", value: String(instituteCount), note: "The vendor bills them, not us" },
        ]}
      />
      <Highlights
        items={[
          unknownOwner.length > 0 &&
            `${unknownOwner.length} key${unknownOwner.length === 1 ? " has" : "s have"} no known account (${[...new Set(unknownOwner.map((r) => vendorName(r.vendor)))].slice(0, 6).join(", ")}). Fill them in with "Edit details" so each vendor bill can be matched to a key.`,
          missing.length > 0 && `Not set up: ${missing.map((r) => vendorName(r.vendor)).join(", ")}. Features that need them won't work.`,
        ]}
      />
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Our keys</CardTitle>
          <p className="text-xs text-muted-foreground">
            Account known for {known} of {platform.length}, price entered for {priced}. Only the last four characters of a key are ever shown.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>How we know</TableHead>
                <TableHead>Price</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {platform.map((r) => (
                <TableRow key={r.details_key}>
                  <TableCell className="font-medium">{vendorName(r.vendor)}</TableCell>
                  <TableCell>
                    <div className="text-xs">{configuredLabel(r.configured)}</div>
                    <div className="text-xs text-muted-foreground">{keyLabel(r.credential)} · {serviceName(r.service)}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{r.key_hint ? `…${r.key_hint}` : "—"}</TableCell>
                  <TableCell>
                    {r.owner ?? <span className="text-muted-foreground">Unknown</span>}
                    {r.notes && <div className="max-w-xs truncate text-xs text-muted-foreground" title={r.notes}>{r.notes}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{SOURCE_LABELS[r.owner_source]}</Badge></TableCell>
                  <TableCell className="text-xs">{priceLabel(r) ?? <span className="text-muted-foreground">Not entered</span>}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {r.credential === "OPENROUTER_API_KEY" && r.key_hint && r.key_hint !== "****" && <OpenRouterCheck hint={r.key_hint} />}
                      <Button variant="outline" size="sm" onClick={() => setEditing(r)}>Edit details</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Institutes' own keys</CardTitle>
          <p className="text-xs text-muted-foreground">
            Accounts an institute connected itself, so the vendor bills them, not us. Their WhatsApp and email accounts aren't listed yet.
          </p>
        </CardHeader>
        <CardContent>
          {institute.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Institute</TableHead>
                  <TableHead>Vendor account ID</TableHead>
                  <TableHead>Kind</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {institute.map((r) => (
                  <TableRow key={`${r.credential}:${r.vendor}:${r.institute_id}`}>
                    <TableCell className="font-medium">{vendorName(r.vendor)}</TableCell>
                    <TableCell>{r.institute_name ?? r.institute_id}</TableCell>
                    <TableCell className="font-mono text-xs">{r.account_ref ?? "—"}</TableCell>
                    <TableCell className="text-xs">{instituteKeyKind(r.credential)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyNote what="institute has its own keys set up" />
          )}
        </CardContent>
      </Card>

      {editing && <DetailsDialog row={editing} units={units} currencies={currencies} onClose={() => setEditing(null)} />}
    </div>
  );
}
