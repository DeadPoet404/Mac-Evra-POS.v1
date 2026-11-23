import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8")
}

test("iPhone device model catalogue migration seeds 35 models and 109 unique variants idempotently", () => {
  const sql = read("supabase/migrations/20261124120000_seed_iphone_device_models.sql")
  const matches = [...sql.matchAll(/\('([^']+)',\s*(\d+)\)/g)]
  assert.equal(matches.length, 111, "Expected 111 model/storage pairs in migration")

  const uniquePairs = new Set(matches.map((m) => `${m[1].toLowerCase()}::${m[2]}`))
  assert.equal(uniquePairs.size, 111, "All model/storage pairs must be unique")

  const uniqueModels = new Set(matches.map((m) => m[1]))
  assert.equal(uniqueModels.size, 35, "Expected 35 distinct iPhone models")

  assert.match(sql, /on conflict \(lower\(model_name\), storage_gb\) do nothing/i)
  assert.ok(uniquePairs.has("iphone xr::128"), "iPhone XR 128GB must be included")
  assert.ok(!uniquePairs.has("iphone 15 pro max::128"), "iPhone 15 Pro Max must not have 128GB")
  assert.ok(!uniquePairs.has("iphone 16 pro max::128"), "iPhone 16 Pro Max must not have 128GB")
  assert.ok(uniquePairs.has("iphone 17 pro max::2048"), "iPhone 17 Pro Max must include 2TB (2048GB)")
})

test("opening-stock invoice line form uses searchable ModelSelector and resolves deviceModelId", () => {
  const page = read("src/app/manager/opening-stock/page.tsx")
  const selector = read("src/app/manager/opening-stock/model-selector.tsx")
  const actions = read("src/app/manager/opening-stock/actions.ts")
  const server = read("src/lib/opening-stock-server.ts")

  assert.match(page, /<ModelSelector deviceModels=\{dashboard\.deviceModels\} inputClass=\{inputClass\} \/>/)
  assert.match(selector, /Search model or storage/)
  assert.match(actions, /register_opening_stock_model/)
  assert.match(server, /from\("device_models"\)/)
})
