import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

/**
 * The draft guard is the one module in this redesign whose whole point is
 * behaviour rather than markup, so it is exercised directly. It has no imports
 * and no React dependency precisely so it can be tested here.
 */
test("the draft guard reports open edits and clears them again", async () => {
  const { registerDraft, clearDraft, hasUnsavedDrafts, unsavedDraftLabel } = await import(
    "../src/app/manager/opening-stock/draft-guard.ts"
  )

  assert.equal(hasUnsavedDrafts(), false, "nothing is dirty to begin with")
  assert.equal(unsavedDraftLabel(), "", "there is no value to name")

  registerDraft("line-1:quantityInvoiced", "Quantity invoiced for iPhone 15: 7")
  assert.equal(hasUnsavedDrafts(), true, "an open edit is reported")
  assert.equal(
    unsavedDraftLabel(),
    "Quantity invoiced for iPhone 15: 7",
    "the prompt can name the value at risk"
  )

  registerDraft("line-1:unitCostGhs", "Unit cost for iPhone 15: 4,200")
  assert.equal(hasUnsavedDrafts(), true, "two open edits still count once")

  clearDraft("line-1:quantityInvoiced")
  assert.equal(hasUnsavedDrafts(), true, "one edit remains open")

  clearDraft("line-1:unitCostGhs")
  assert.equal(hasUnsavedDrafts(), false, "saving everything clears the guard")

  // Clearing an unknown key must be harmless: a tab torn down twice, or a cell
  // that never registered, must not resurrect a false "unsaved" prompt.
  clearDraft("never-registered")
  assert.equal(hasUnsavedDrafts(), false)
})

test("navigating away from an open edit is guarded everywhere it can happen", () => {
  const workspace = read("src/app/manager/opening-stock/workspace.tsx")
  const editable = read("src/app/manager/opening-stock/editable-cell.tsx")

  // Both destructive navigations go through the guard: switching tab, and
  // switching invoice. Those are the only two ways a draft could be lost.
  assert.match(workspace, /hasUnsavedDrafts/, "the workspace consults the guard")
  assert.match(
    workspace,
    /role="alertdialog"[\s\S]{0,400}Unsaved edit/,
    "the guard is announced, not a silent failure"
  )
  assert.match(workspace, /Keep editing/, "the user can return to the open edit")
  assert.match(workspace, /Discard and continue/, "discarding is explicit, never implicit")
  assert.match(
    workspace,
    /guardedNavigation\(`switch to \$\{item\.label\}`/,
    "tab switches are guarded"
  )
  assert.match(workspace, /guardedNavigation\("switch invoice"/, "invoice switches are guarded")

  // The cell registers while editing and always deregisters on unmount.
  assert.match(editable, /registerDraft\(draftKey/, "an edited cell registers its draft")
  assert.match(editable, /clearDraft\(draftKey\)/, "a settled or dismantled cell clears its draft")
  assert.match(
    editable,
    /return \(\) => clearDraft\(draftKey\)/,
    "unmounting a tab can never leave a stale dirty flag"
  )
})

test("saving with Tab moves focus to the next cell in document order", () => {
  const editable = read("src/app/manager/opening-stock/editable-cell.tsx")
  const invoicesTab = read("src/app/manager/opening-stock/invoices-tab.tsx")
  const linesTab = read("src/app/manager/opening-stock/lines-tab.tsx")

  assert.match(editable, /export function focusCell/, "focus movement is exposed")
  assert.match(editable, /registerFocusableCell/, "cells publish their element for focusing")
  assert.match(editable, /focusCell\(nextCellKey/, "a Tab save moves focus forward")

  // Real keys on the real tables, so the chain is not decorative.
  assert.match(invoicesTab, /cellKey=\{`\$\{invoice\.id\}:supplierName`\}/)
  assert.match(
    invoicesTab,
    /nextCellKey=\{closed \? null : `\$\{invoice\.id\}:supplierInvoiceNumber`\}/,
    "supplier → invoice reference"
  )
  assert.match(
    invoicesTab,
    /nextCellKey=\{closed \? null : `\$\{invoice\.id\}:invoiceDate`\}/,
    "invoice reference → date"
  )
  assert.match(linesTab, /cellKey=\{`\$\{line\.id\}:quantityInvoiced`\}/)
  assert.match(
    linesTab,
    /nextCellKey=\{costLocked \|\| closed \? null : `\$\{line\.id\}:unitCostGhs`\}/,
    "quantity → cost, but never into a frozen cost"
  )
})
