/** One topic of the Content Library (a course, subject, chapter...), as assessment-service sends it. */
export interface LibraryNode {
  id: string;
  parent_id: string | null;
  name: string;
  description?: string | null;
  display_order?: number | null;
  depth?: number | null;
  question_count?: number | null;
  /** How many institutes were given this topic directly. */
  access_count?: number | null;
}

export interface LibraryTree {
  nodes: LibraryNode[];
  max_depth?: number;
}

/** What one institute was given. */
export interface InstituteLibraryAccess {
  library_configured: boolean;
  /** The owner institute sees and manages all of it. */
  owner: boolean;
  granted_node_ids: string[];
}
