// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  childrenByParent,
  hiddenAncestor,
  pathOf,
  searchVisible,
  visibleQuestionCount,
} from "../src/lib/content-library.ts";
import type { LibraryNode } from "../src/types/content-library.ts";

const n = (id: string, parent: string | null, name: string, order = 0, questions = 0): LibraryNode => ({
  id,
  parent_id: parent,
  name,
  display_order: order,
  question_count: questions,
});

const NODES = [
  n("jee", null, "JEE Main", 1, 51),
  n("ncert", null, "NCERT", 0, 301),
  n("c10", "ncert", "Class 10", 0, 282),
  n("sci", "c10", "Science", 0, 261),
  n("acid", "sci", "Acids, Bases and Salts", 0, 20),
  n("orphan", "gone", "Orphan topic", 5, 1),
];
const byId = new Map(NODES.map((x) => [x.id, x]));

test("children are grouped by parent, sorted by display order; an orphan goes to the top level", () => {
  const map = childrenByParent(NODES);
  assert.deepEqual(map.get("")!.map((x) => x.id), ["ncert", "jee", "orphan"]);
  assert.deepEqual(map.get("c10")!.map((x) => x.id), ["sci"]);
});

test("a topic inside a hidden course is hidden through its nearest hidden ancestor", () => {
  const hidden = new Set(["ncert"]);
  assert.equal(hiddenAncestor("acid", byId, hidden)?.id, "ncert");
  assert.equal(hiddenAncestor("ncert", byId, hidden), null);
  assert.equal(hiddenAncestor("jee", byId, hidden), null);
  assert.equal(hiddenAncestor("acid", byId, new Set(["ncert", "c10"]))?.id, "c10");
});

test("path joins names from the course down", () => {
  assert.equal(pathOf("acid", byId), "NCERT › Class 10 › Science › Acids, Bases and Salts");
  assert.equal(pathOf("missing", byId), "");
});

test("search keeps matches and their ancestors; blank search shows everything", () => {
  assert.equal(searchVisible(NODES, "  "), null);
  assert.deepEqual([...searchVisible(NODES, "acid")!].sort(), ["acid", "c10", "ncert", "sci"]);
  assert.equal(searchVisible(NODES, "zzz")!.size, 0);
});

test("with nothing hidden an institute sees every question of the library", () => {
  assert.equal(visibleQuestionCount(NODES, new Set()), 353);
  assert.equal(visibleQuestionCount(NODES, new Set(["deleted"])), 353);
});

test("hidden topics come off once, even when one sits inside another", () => {
  assert.equal(visibleQuestionCount(NODES, new Set(["sci"])), 92);
  assert.equal(visibleQuestionCount(NODES, new Set(["ncert", "sci"])), 52);
  assert.equal(visibleQuestionCount(NODES, new Set(["ncert", "jee", "orphan"])), 0);
});
