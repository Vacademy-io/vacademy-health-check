// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SHORT_LINKS,
  shortLinkLabel,
  shortLinkUrl,
  shortLinksProblem,
} from "../src/components/products/shortLinks.ts";

test("good short links pass, as the server will save them", () => {
  assert.equal(shortLinksProblem(null), null);
  assert.equal(shortLinksProblem([]), null);
  assert.equal(
    shortLinksProblem([
      { code: " IG ", source: "Instagram", campaign: "Launch-2026" },
      { code: "wa", source: "whatsapp", campaign: "" },
      { code: "li", source: "linkedin", campaign: null },
    ]),
    null
  );
});

test("bad short links are refused with a reason", () => {
  for (const bad of [
    { code: "a b", source: "instagram" },
    { code: "-ig", source: "instagram" },
    { code: "ig/x", source: "instagram" },
    { code: "", source: "instagram" },
    { code: "ig", source: " " },
    { code: "ig", source: "insta gram" },
    { code: "ig", source: "instagram", campaign: "big sale" },
  ]) {
    assert.notEqual(shortLinksProblem([bad]), null, JSON.stringify(bad));
  }
  assert.match(
    shortLinksProblem([
      { code: "ig", source: "instagram" },
      { code: "IG", source: "linkedin" },
    ]) ?? "",
    /Two short links are ig/
  );
  const many = Array.from({ length: MAX_SHORT_LINKS + 1 }, (_, i) => ({ code: `c${i}`, source: "instagram" }));
  assert.notEqual(shortLinksProblem(many), null);
});

test("the link is made from the product's website", () => {
  assert.equal(shortLinkUrl("https://example.com", " IG "), "https://example.com/ig");
  assert.equal(shortLinkUrl("https://example.com/", "ig"), "https://example.com/ig");
  assert.equal(shortLinkUrl("http://example.com", "ig"), null);
  assert.equal(shortLinkUrl("https://example.com/page", "ig"), null);
  assert.equal(shortLinkUrl(null, "ig"), null);
  assert.equal(shortLinkUrl("https://example.com", " "), null);
  assert.equal(shortLinkLabel("https://www.example.com/ig"), "example.com/ig");
});
