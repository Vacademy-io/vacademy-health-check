/** A short link on the product's website: <website>/<code> opens the site with this source and campaign. */
export interface ProductShortLink {
  /** The path after the domain, like ig. */
  code: string;
  /** utm_source of the visit, like instagram. */
  source: string;
  /** utm_campaign of the visit. Optional. */
  campaign?: string | null;
}

export const MAX_SHORT_LINKS = 50;
const CODE = /^[a-z0-9][a-z0-9-]{0,29}$/;
const UTM_VALUE = /^[a-z0-9][a-z0-9_.-]{0,59}$/;

/** As the server saves it: trimmed and lowercased. */
const clean = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** Why the short links cannot be saved, or null. Same rules as the server. */
export function shortLinksProblem(links: ProductShortLink[] | null | undefined): string | null {
  const list = links ?? [];
  if (list.length > MAX_SHORT_LINKS) return `At most ${MAX_SHORT_LINKS} short links.`;
  const codes = new Set<string>();
  for (const link of list) {
    const code = clean(link.code);
    if (!CODE.test(code)) return "Short link: up to 30 letters, numbers or -, like ig. No spaces or /.";
    if (codes.has(code)) return `Two short links are ${code}.`;
    codes.add(code);
    if (!UTM_VALUE.test(clean(link.source)))
      return `Short link ${code} needs a source: letters, numbers, - _ or . with no spaces, like instagram.`;
    const campaign = clean(link.campaign);
    if (campaign && !UTM_VALUE.test(campaign))
      return `Short link ${code}: the campaign can hold only letters, numbers, - _ or . with no spaces.`;
  }
  return null;
}

/** The full link to share, or null while the product has no https website or the code is empty. */
export function shortLinkUrl(website: string | null | undefined, code: string): string | null {
  const base = (website ?? "").trim().replace(/\/+$/, "");
  const path = clean(code);
  if (!/^https:\/\/[^/\s]+$/.test(base) || !path) return null;
  return `${base}/${path}`;
}

/** How the link reads in a post: no https:// or www. */
export const shortLinkLabel = (url: string) => url.replace(/^https:\/\//, "").replace(/^www\./, "");
