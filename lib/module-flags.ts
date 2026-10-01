// Modules that exist in the code but aren't finished. While a flag is off
// the module has no sidebar item, no staff-permission toggle, and its route
// sends people back to the dashboard instead of showing an empty page
// (QA BUG-25). Turn a flag on only when the module has real content.
export const MODULE_FLAGS = {
  /** Teaching (lesson plans etc.) — not built yet. */
  teaching: false,
} as const;
