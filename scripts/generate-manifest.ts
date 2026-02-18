import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const APP_NAME = 'balatro-saves-sync'
const DIST_DIR = 'dist'

interface ManifestPlatform {
  binary: string
  checksum: string
  size: number
}

async function generateManifest() {
  const version = process.argv[2]
  if (!version) {
    console.error('Usage: bun run scripts/generate-manifest.ts <version>')
    process.exit(1)
  }

  const platforms: Record<string, ManifestPlatform> = {}
  const files = await readdir(DIST_DIR)

  for (const file of files) {
    // Skip manifest itself and the local dev binary
    if (file === 'manifest.json' || file === APP_NAME) continue

    // Parse platform from filename: balatro-saves-sync-{platform}[.exe]
    const match = file.match(new RegExp(`^${APP_NAME}-(.+?)(\\.exe)?$`))
    if (!match) continue

    const platform = match[1]
    const filePath = join(DIST_DIR, file)

    const content = await readFile(filePath)
    const checksum = createHash('sha256').update(content).digest('hex')
    const fileInfo = await stat(filePath)

    platforms[platform] = {
      binary: file,
      checksum,
      size: fileInfo.size
    }
  }

  const manifest = {
    version,
    buildDate: new Date().toISOString(),
    platforms
  }

  const outPath = join(DIST_DIR, 'manifest.json')
  await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

  console.log(`Generated ${outPath}:`)
  console.log(JSON.stringify(manifest, null, 2))
}

generateManifest()
