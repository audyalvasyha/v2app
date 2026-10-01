// Analisis dead-code: hitung file yang tak terjangkau dari entrypoint app/.
// Dijalankan sekali untuk audit, bukan bagian dari build.
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const DIRS = ["app", "components", "hooks", "lib", "utils"]
const ENTRY = ["app/page.tsx", "app/layout.tsx", "app/loading.tsx", "app/skr/input/page.tsx", "app/api/cron/service-reminder/route.ts"]

const allFiles = []
for (const d of DIRS) {
  const walk = (dir) => {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) return
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")) allFiles.push(p)
    }
  }
  walk(d)
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\(\s*)["']([^"']+)["']/g
const cache = new Map()
function resolve(from, spec) {
  let target
  if (spec.startsWith("@/")) target = spec.slice(2)
  else if (spec.startsWith(".")) target = path.normalize(path.join(path.dirname(from), spec))
  else return null // paket eksternal
  const base = path.join(ROOT, target)
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c.replace(ROOT + "/", "")
  }
  return null
}
function imports(file) {
  if (cache.has(file)) return cache.get(file)
  let src = ""
  try { src = fs.readFileSync(path.join(ROOT, file), "utf8") } catch { return [] }
  const out = []
  for (const m of src.matchAll(IMPORT_RE)) {
    const r = resolve(file, m[1])
    if (r) out.push(r)
  }
  cache.set(file, out)
  return out
}

const seen = new Set()
const stack = ENTRY.filter((e) => fs.existsSync(e))
while (stack.length) {
  const f = stack.pop()
  if (seen.has(f)) continue
  seen.add(f)
  for (const i of imports(f)) if (!seen.has(i)) stack.push(i)
}

const unused = allFiles.filter((f) => !seen.has(f)).sort()
console.log(`Total: ${allFiles.length} file | terpakai: ${seen.size} | tidak terpakai: ${unused.length}\n`)
for (const u of unused) console.log(u)