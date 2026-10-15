// Which model list a use case's picker shows. Pure (no "@/" imports) so
// `node --test tests/` can run it (see tests/llm-keys.test.ts).
import type { ModelOption, UseCaseEntry } from "../types/model-defaults";

/** Image-generation use cases without the "_image" suffix ("image" is a legacy prod row on openai/gpt-image-2). */
const IMAGE_USE_CASES_BY_NAME = new Set(["video_support_visual", "image"]);

/**
 * True for an image-generation use case (page_builder_image, video_image, video_support_visual, …).
 * The catalog's `kind` decides when it says "image"; older ai-service builds only send chat/vision,
 * so the key name is the fallback.
 */
export function isImageUseCase(u: Pick<UseCaseEntry, "use_case"> & { kind?: string | null } | null | undefined): boolean {
  if (!u) return false;
  if (String(u.kind ?? "").toLowerCase() === "image") return true;
  return u.use_case.endsWith("_image") || IMAGE_USE_CASES_BY_NAME.has(u.use_case);
}

export function isImageModel(m: Pick<ModelOption, "category">): boolean {
  return (m.category || "").toLowerCase() === "image";
}
