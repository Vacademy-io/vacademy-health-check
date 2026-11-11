import test from "node:test";
import assert from "node:assert/strict";
import { chargeLabel, explainError, humanize, sourceLabel, vendorName, windowLabel } from "../src/components/external-apis/format.ts";

test("sourceLabel names where a call was recorded", () => {
  assert.equal(sourceLabel("ai"), "AI call");
  assert.equal(sourceLabel("calls"), "Logged vendor call");
  assert.equal(sourceLabel("webhooks"), "Webhook");
  assert.equal(sourceLabel("NEW_SOURCE"), "New source");
});

test("vendorName never shows a bare unknown", () => {
  assert.equal(vendorName("unknown"), "Vendor not tracked");
  assert.equal(vendorName("none"), "Vendor not tracked");
  assert.equal(vendorName(null), "Vendor not tracked");
  assert.equal(vendorName("none:Emails sent"), "Emails sent (vendor not tracked)");
});

test("vendorName marks a vendor guessed from the model name", () => {
  assert.equal(vendorName("model:google"), "Google model, route not recorded");
});

test("vendorName says when a vendor was worked out rather than recorded", () => {
  assert.equal(vendorName("likely:openrouter"), "OpenRouter (likely)");
  assert.equal(vendorName("likely:plivo"), "Plivo (likely)");
  assert.equal(vendorName("likely:voice_bot"), "Voice bot stack (likely)");
  assert.equal(vendorName("anthropic"), "Anthropic");
});

test("vendorName uses proper names and leaves hosts alone", () => {
  assert.equal(vendorName("openrouter"), "OpenRouter");
  assert.equal(vendorName("PLIVO"), "Plivo");
  assert.equal(vendorName("NEW_VENDOR"), "New Vendor");
  assert.equal(vendorName("api.brandnew.ai"), "api.brandnew.ai");
});

test("humanize reads codes but leaves real text alone", () => {
  assert.equal(humanize("NO_ANSWER"), "No answer");
  assert.equal(humanize("course_generation"), "Course generation");
  assert.equal(humanize("SUCCESS"), "Success");
  assert.equal(humanize("POST /v1/x"), "POST /v1/x");
  assert.equal(humanize("Connect timed out"), "Connect timed out");
  assert.equal(humanize(null), "—");
});

test("chargeLabel explains why a call was not charged", () => {
  assert.equal(chargeLabel("DROPPED_INSUFFICIENT"), "Not charged: out of credits");
  assert.equal(chargeLabel("SOMETHING_NEW"), "Something new");
});

test("windowLabel names the range", () => {
  assert.equal(windowLabel(1), "the last hour");
  assert.equal(windowLabel(24), "the last 24 hours");
  assert.equal(windowLabel(168), "the last 7 days");
});

const failure = (status: number, data?: unknown) => ({ response: { status, data } });

test("explainError says what to do, not just a status code", () => {
  assert.match(explainError(failure(403)), /SUPER_ADMIN_USER_IDS/);
  assert.match(explainError(failure(401)), /Sign in again/);
  assert.match(explainError(failure(408)), /shorter time range/);
  assert.match(explainError(failure(500, { error: "boom" })), /error \(500\).*boom/);
  assert.match(explainError(failure(400, { error: 'relation "x" does not exist' })), /migration/);
  assert.match(explainError({ code: "ECONNABORTED" }), /too long/);
  assert.match(explainError({}), /Could not reach/);
});

test("explainError does not echo a huge server body", () => {
  assert.doesNotMatch(explainError(failure(500, { error: "x".repeat(500) })), /xxx/);
});
