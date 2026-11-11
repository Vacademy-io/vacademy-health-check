// Run: npm test  (node --test with native TypeScript stripping; no extra deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  childrenByParent,
  grantedAncestor,
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

test("a topic inside a given course is included through its nearest given ancestor", () => {
  const granted = new Set(["ncert"]);
  assert.equal(grantedAncestor("acid", byId, granted)?.id, "ncert");
  assert.equal(grantedAncestor("ncert", byId, granted), null);
  assert.equal(grantedAncestor("jee", byId, granted), null);
  assert.equal(grantedAncestor("acid", byId, new Set(["ncert", "c10"]))?.id, "c10");
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

test("visible questions do not count a topic inside another given topic twice", () => {
  assert.equal(visibleQuestionCount(NODES, new Set(["ncert", "sci", "jee"])), 352);
  assert.equal(visibleQuestionCount(NODES, new Set(["sci"])), 261);
  assert.equal(visibleQuestionCount(NODES, new Set(["deleted"])), 0);
});
