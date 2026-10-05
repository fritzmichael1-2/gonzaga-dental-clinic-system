/**
 * ============================================================================
 * PREVIEW MODE — THROW AWAY BEFORE SHIPPING
 * ============================================================================
 *
 * Single place that answers "is this the fake dataset?". Set GDCMAS_PREVIEW=1
 * to render the UI with fabricated records and no database; leave it unset in
 * any real environment.
 */

export { isPreviewMode, createPreviewClient } from "./mock-supabase";
export { PREVIEW_NOW } from "./fixtures";