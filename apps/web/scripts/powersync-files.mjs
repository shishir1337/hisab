// After `powersync-web copy-assets`: list the PowerSync worker/wasm files the app can load, so the service
// worker can cache them for offline cold starts (public/@powersync/files.json). Source maps and the
// SQLCipher ("mc-") builds are skipped: the app doesn't use encryption.
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '../public/@powersync')
const files = fs
  .readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => path.relative(root, path.join(d.parentPath, d.name)).split(path.sep).join('/'))
  .filter((f) => !f.endsWith('.map') && !f.endsWith('.json') && !path.basename(f).startsWith('mc-'))
  .sort()
fs.writeFileSync(path.join(root, 'files.json'), JSON.stringify(files, null, 1) + '\n')
console.log(`@powersync/files.json: ${files.length} files`)
