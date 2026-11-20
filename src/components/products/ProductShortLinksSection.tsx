import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_SHORT_LINKS,
  shortLinkLabel,
  shortLinkUrl,
  shortLinksProblem,
  type ProductShortLink,
} from "./shortLinks";

/**
 * Short links on the product's website, like <website>/ig: each opens the site with a source and a
 * campaign, so a sign-up from a post shows where it came from. The website reads this list.
 */
export function ProductShortLinksSection({
  displayName,
  websiteUrl,
  links,
  onChange,
  saveRow,
}: {
  displayName: string;
  websiteUrl: string | null;
  links: ProductShortLink[] | null | undefined;
  onChange: (links: ProductShortLink[]) => void;
  saveRow: ReactNode;
}) {
  const list = links ?? [];
  const [copied, setCopied] = useState<number | null>(null);
  const setLink = (i: number, patch: Partial<ProductShortLink>) =>
    onChange(list.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const problem = shortLinksProblem(list);
  const domain = shortLinkUrl(websiteUrl, "x")?.slice(0, -1);

  const copy = async (i: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(i);
      window.setTimeout(() => setCopied((c) => (c === i ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Short links</h3>
        <p className="text-xs text-muted-foreground">
          Put these in posts instead of the bare {displayName} website. A link opens the website with utm_source and
          utm_campaign; a sign-up that came through it shows them in the UTM Source and UTM Campaign columns of the
          product's sign-up lead list. A new link works as soon as it is saved. Changing or removing a link that was already live, and link previews in WhatsApp or LinkedIn,
          take effect after the website's next deploy: for a new campaign, add a new link instead of changing one.
          Do not use a name that is already a page on the website, like blog or demo: the page opens instead.
        </p>
      </div>
      {!domain && (
        <p role="alert" className="text-sm text-destructive">
          Set the Website (https://…) in the Trial and mail tab first: the links are made from it.
        </p>
      )}
      {list.map((link, i) => {
        const url = shortLinkUrl(websiteUrl, link.code);
        return (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="w-56 space-y-1">
              <Label htmlFor={`short-code-${i}`}>Link</Label>
              <div className="flex items-center gap-1">
                {domain && <span className="text-sm text-muted-foreground">{shortLinkLabel(domain)}</span>}
                <Input
                  id={`short-code-${i}`}
                  placeholder="ig"
                  value={link.code}
                  onChange={(e) => setLink(i, { code: e.target.value })}
                />
              </div>
            </div>
            <div className="w-36 space-y-1">
              <Label htmlFor={`short-source-${i}`}>Source</Label>
              <Input
                id={`short-source-${i}`}
                placeholder="instagram"
                value={link.source}
                onChange={(e) => setLink(i, { source: e.target.value })}
              />
            </div>
            <div className="w-36 space-y-1">
              <Label htmlFor={`short-campaign-${i}`}>Campaign</Label>
              <Input
                id={`short-campaign-${i}`}
                placeholder="optional"
                value={link.campaign ?? ""}
                onChange={(e) => setLink(i, { campaign: e.target.value })}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!url}
              aria-label={url ? `Copy ${shortLinkLabel(url)}` : "Copy link"}
              onClick={() => url && void copy(i, url)}
            >
              {copied === i ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied === i ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Remove ${link.code || "short link"}`}
              onClick={() => onChange(list.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      {list.length < MAX_SHORT_LINKS && (
        <Button variant="outline" size="sm" onClick={() => onChange([...list, { code: "", source: "", campaign: "" }])}>
          <Plus className="mr-1 h-4 w-4" /> Add short link
        </Button>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {saveRow}
    </section>
  );
}
