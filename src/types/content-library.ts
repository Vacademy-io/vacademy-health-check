/** One topic of the Content Library (a course, subject, chapter...), as assessment-service sends it. */
export interface LibraryNode {
  id: string;
  parent_id: string | null;
  name: string;
  description?: string | null;
  display_order?: number | null;
  depth?: number | null;
  question_count?: number | null;
  /** How many institutes this topic is hidden from directly. */
  hidden_count?: number | null;
}

export interface LibraryTree {
  nodes: LibraryNode[];
  max_depth?: number;
}

/** What is hidden from one institute. It sees the rest of the library. */
export interface InstituteLibraryAccess {
  library_configured: boolean;
  /** The owner institute sees and manages all of it. */
  owner: boolean;
  /** Topics hidden from it directly. Everything below each one is hidden too. */
  hidden_node_ids: string[];
}
