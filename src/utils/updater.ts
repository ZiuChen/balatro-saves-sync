import { createHash } from 'node:crypto'
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { platform } from 'node:os'
import pc from 'picocolors'
import {
  APP_NAME,
  APP_VERSION,
  GITHUB_API_RELEASES,
  getBinaryAssetName,
  getBinDir,
  getInstallDir,
  getInstalledBinaryPath,
  getPlatformKey
} from '@/utils/constants'
import { logger } from '@/utils/logger'

// ─── Types ───────────────────────────────────────────────

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface ReleaseInfo {
  tag_name: string
  assets: ReleaseAsset[]
}

interface ManifestPlatform {
  binary: string
  checksum: string
  size: number
}

interface Manifest {
  version: string
  buildDate: string
  platforms: Record<string, ManifestPlatform>
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Compare two semver version strings.
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// ─── Public API ──────────────────────────────────────────

/**
 * Check if a newer version is available on GitHub Releases.
 */
export async function checkForUpdate(): Promise<{
  available: boolean
  latestVersion?: string
  release?: ReleaseInfo
}> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(`${GITHUB_API_RELEASES}/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': APP_NAME },
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!res.ok) return { available: false }

    const release = (await res.json()) as ReleaseInfo
    const latest = release.tag_name.replace(/^v/, '')

    if (compareVersions(latest, APP_VERSION) > 0) {
      return { available: true, latestVersion: latest, release }
    }
    return { available: false }
  } catch {
    return { available: false }
  }
}

/**
 * Download and verify a new version, then replace the installed binary.
 */
export async function performUpdate(version?: string): Promise<boolean> {
  const platformKey = getPlatformKey()
  const assetName = getBinaryAssetName()

  await logger.info(`Starting update${version ? ` to v${version}` : ''}...`)

  // 1. Get release info
  let release: ReleaseInfo
  try {
    const url = version
      ? `${GITHUB_API_RELEASES}/tags/v${version}`
      : `${GITHUB_API_RELEASES}/latest`

    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': APP_NAME }
    })
    if (!res.ok) {
      await logger.error(`Failed to fetch release: HTTP ${res.status}`)
      return false
    }
    release = (await res.json()) as ReleaseInfo
  } catch (err) {
    await logger.error(`Failed to fetch release info: ${err}`)
    return false
  }

  const releaseVersion = release.tag_name.replace(/^v/, '')

  // 2. Download and parse manifest.json
  const manifestAsset = release.assets.find((a) => a.name === 'manifest.json')
  if (!manifestAsset) {
    await logger.error('manifest.json not found in release assets')
    return false
  }

  let manifest: Manifest
  try {
    const res = await fetch(manifestAsset.browser_download_url)
    manifest = (await res.json()) as Manifest
  } catch (err) {
    await logger.error(`Failed to download manifest: ${err}`)
    return false
  }

  // 3. Get platform checksum
  const platformInfo = manifest.platforms[platformKey]
  if (!platformInfo) {
    await logger.error(`Platform ${platformKey} not supported in this release`)
    return false
  }

  // 4. Download binary
  const binaryAsset = release.assets.find((a) => a.name === assetName)
  if (!binaryAsset) {
    await logger.error(`Binary asset ${assetName} not found in release`)
    return false
  }

  await logger.info(
    `Downloading v${releaseVersion} for ${platformKey} (${formatBytes(platformInfo.size)})...`
  )

  let binaryBuffer: Buffer
  try {
    const res = await fetch(binaryAsset.browser_download_url)
    binaryBuffer = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    await logger.error(`Failed to download binary: ${err}`)
    return false
  }

  // 5. Verify SHA256 checksum
  const actualChecksum = createHash('sha256').update(binaryBuffer).digest('hex')
  if (actualChecksum !== platformInfo.checksum) {
    await logger.error('Checksum verification failed!')
    await logger.error(`  Expected: ${platformInfo.checksum}`)
    await logger.error(`  Actual:   ${actualChecksum}`)
    return false
  }

  await logger.info('Checksum verified ✓')

  // 6. Write to staging path, then atomic rename
  const installedPath = getInstalledBinaryPath()
  const binDir = getBinDir()
  const stagingPath = `${installedPath}.update`

  try {
    await mkdir(binDir, { recursive: true })
    await writeFile(stagingPath, binaryBuffer)

    if (platform() !== 'win32') {
      await chmod(stagingPath, 0o755)
    }

    // Atomic rename (same directory = same filesystem)
    await rename(stagingPath, installedPath)
  } catch (err) {
    await logger.error(`Failed to install update: ${err}`)
    try {
      await unlink(stagingPath)
    } catch {
      /* ignore cleanup failure */
    }
    return false
  }

  // 7. Write version file
  try {
    const installDir = getInstallDir()
    await mkdir(installDir, { recursive: true })
    await writeFile(`${installDir}/version`, releaseVersion, 'utf-8')
  } catch {
    // Non-critical
  }

  await logger.info(`✅ Updated to v${releaseVersion}!`)
  return true
}

/**
 * Non-blocking update check — prints notification if update available.
 */
export async function checkAndNotifyUpdate(): Promise<void> {
  if (process.env.DISABLE_AUTOUPDATER === '1') return

  try {
    const { available, latestVersion } = await checkForUpdate()
    if (available && latestVersion) {
      console.log('')
      console.log(
        pc.yellow(`💡 New version available: v${latestVersion} (current: v${APP_VERSION})`)
      )
      console.log(pc.dim(`   Run \`${APP_NAME} update\` to update`))
      console.log('')
    }
  } catch {
    // Silently ignore
  }
}

/**
 * Background auto-update: check + download + install silently.
 * Used in watch mode to keep the binary up to date.
 */
export async function backgroundAutoUpdate(): Promise<void> {
  if (process.env.DISABLE_AUTOUPDATER === '1') return

  try {
    const { available, latestVersion } = await checkForUpdate()
    if (available && latestVersion) {
      await logger.info(`Auto-updating to v${latestVersion}...`)
      const success = await performUpdate(latestVersion)
      if (success) {
        console.log('')
        console.log(
          pc.green(`✅ Updated to v${latestVersion}. Changes take effect on next restart.`)
        )
        console.log('')
      }
    }
  } catch (err) {
    await logger.debug(`Background auto-update failed: ${err}`)
  }
}
