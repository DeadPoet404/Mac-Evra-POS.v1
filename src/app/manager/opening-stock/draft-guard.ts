"use client"

/**
 * Tracks inline edits that are open but not yet saved.
 *
 * A cell registers itself while it holds an unsaved draft and clears itself on
 * save or cancel. The workspace consults this before changing tab or switching
 * invoice, so a half-typed value can never be thrown away by an unrelated click —
 * the failure the previous multi-form design had, where navigating away silently
 * discarded everything typed since the last page load.
 *
 * Kept as a module-scope registry rather than context so that cells nested in
 * three different tab trees can register without prop drilling, and so a
 * dismantling tab cannot leave a stale "dirty" flag behind (cells deregister on
 * unmount).
 */
const openDrafts = new Map<string, string>()

export function registerDraft(key: string, value: string) {
  openDrafts.set(key, value)
}

export function clearDraft(key: string) {
  openDrafts.delete(key)
}

export function hasUnsavedDrafts() {
  return openDrafts.size > 0
}

export function unsavedDraftLabel() {
  const first = openDrafts.values().next()
  return first.done ? "" : first.value
}
