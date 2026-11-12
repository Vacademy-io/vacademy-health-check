// Pure helpers for the institute "Content Library" tab. No React and no "@/" imports,
// so `node --test tests/` can run them directly (see tests/content-library.test.ts).
import type { LibraryNode } from "../types/content-library";

/** Topics by parent ("" for the top level), each list in display order then name. */
export function childrenByParent(nodes: LibraryNode[]): Map<string, LibraryNode[]> {
  const map = new Map<string, LibraryNode[]>();
  const ids = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    // A topic whose parent is not in the list is shown at the top so it is never lost.
    const key = node.parent_id && ids.has(node.parent_id) ? node.parent_id : "";
    const list = map.get(key) ?? [];
    list.push(node);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name));
  }
  return map;
}

/**
 * The nearest hidden ancestor, when a topic is hidden because a bigger topic above it is
 * hidden. Null when none is, even if the topic is hidden itself.
 */
export function hiddenAncestor(
  nodeId: string,
  byId: Map<string, LibraryNode>,
  hidden: Set<string>
): LibraryNode | null {
  const seen = new Set<string>();
  let current = byId.get(nodeId)?.parent_id ?? null;
  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    if (hidden.has(current)) return byId.get(current) ?? null;
    current = byId.get(current)?.parent_id ?? null;
  }
  return null;
}

/** "Course › Subject › Chapter" for one topic. */
export function pathOf(nodeId: string, byId: Map<string, LibraryNode>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current: string | null = nodeId;
  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    const node: LibraryNode = byId.get(current)!;
    names.unshift(node.name);
    current = node.parent_id;
  }
  return names.join(" › ");
}

/**
 * Ids to show for a search: every topic whose name matches, with its ancestors so it can
 * be reached. Null for an empty search (show everything).
 */
export function searchVisible(nodes: LibraryNode[], query: string): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = new Set<string>();
  for (const node of nodes) {
    if (!node.name.toLowerCase().includes(q)) continue;
    let current: string | null = node.id;
    while (current && byId.has(current) && !visible.has(current)) {
      visible.add(current);
      current = byId.get(current)!.parent_id;
    }
  }
  return visible;
}

/**
 * Questions an institute sees: the whole library minus each hidden topic's count, without
 * taking off a topic inside another hidden topic twice. A topic's count includes the
 * topics below it.
 */
export function visibleQuestionCount(nodes: LibraryNode[], hidden: Set<string>): number {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let total = 0;
  for (const top of childrenByParent(nodes).get("") ?? []) total += top.question_count ?? 0;
  for (const id of hidden) {
    const node = byId.get(id);
    if (!node || hiddenAncestor(id, byId, hidden)) continue;
    total -= node.question_count ?? 0;
  }
  return Math.max(0, total);
}
