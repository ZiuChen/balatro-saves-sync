import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
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
import { compareVersions, formatBytes } from '@/utils/helpers'
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
 * Download a file with a progress bar displayed in the terminal.
 * Uses the ReadableStream from fetch to track bytes received.
 */
async function downloadWithProgress(url: string, totalSize: number): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  const barWidth = 30

  const renderProgress = () => {
    const ratio = totalSize > 0 ? Math.min(received / totalSize, 1) : 0
    const percent = Math.floor(ratio * 100)
    const filled = Math.round(barWidth * ratio)
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled)
    const receivedStr = formatBytes(received)
    const totalStr = formatBytes(totalSize)
    process.stdout.write(
      `\r  ${bar} ${String(percent).padStart(3)}% (${receivedStr} / ${totalStr})`
    )
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    renderProgress()
  }

  // Clear progress line and move to next line
  process.stdout.write('\r' + ' '.repeat(80) + '\r')

  // Concatenate all chunks into a single Buffer
  const full = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    full.set(chunk, offset)
    offset += chunk.length
  }
  return Buffer.from(full)
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
    binaryBuffer = await downloadWithProgress(binaryAsset.browser_download_url, platformInfo.size)
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

    // Remove macOS quarantine/provenance attributes to prevent iCloud access issues
    if (platform() === 'darwin') {
      try {
        execSync(`xattr -cr "${stagingPath}"`, { stdio: 'ignore' })
      } catch {
        // Not critical
      }
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
