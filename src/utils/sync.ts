import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import type { AppConfig } from '@/utils/config'
import { createBackup } from '@/utils/backup'
import { formatBytes, formatDateTime, getLatestMtime } from '@/utils/helpers'
import { logger } from '@/utils/logger'

/**
 * DOWNLOAD: Copy saves from iCloud cloud save directory to local save directory.
 * Before downloading, backs up both local saves and cloud saves.
 */
export async function download(config: AppConfig): Promise<boolean> {
  const { saveDir, cloudSaveDir, backupDir } = config

  await logger.info('=== DOWNLOAD: iCloud → Local ===')

  // Check cloud save exists and has content
  if (!existsSync(cloudSaveDir)) {
    await logger.warn('Cloud save directory does not exist.')
    await logger.warn(
      'Skipping download. Please upload a save first or check your iCloud directory.'
    )
    return false
  }

  const cloudEntries = await readdir(cloudSaveDir)
  if (cloudEntries.length === 0) {
    await logger.warn('Cloud save directory is empty.')
    await logger.warn('Skipping download. No cloud save found.')
    return false
  }

  // Backup local saves before overwriting
  await logger.info('Backing up local saves before download...')
  await createBackup(saveDir, backupDir, 'local-before-download')

  // Backup cloud saves for safety
  await logger.info('Backing up cloud saves...')
  await createBackup(cloudSaveDir, backupDir, 'cloud-before-download')

  // Ensure local save directory exists
  await mkdir(saveDir, { recursive: true })

  // Clear local save directory and copy cloud saves
  try {
    const localEntries = await readdir(saveDir)
    for (const entry of localEntries) {
      await rm(`${saveDir}/${entry}`, { recursive: true, force: true })
    }

    await cp(cloudSaveDir, saveDir, { recursive: true })

    const newEntries = await readdir(saveDir)
    await logger.info(`Download complete: ${newEntries.length} items synced.`)
    return true
  } catch (err) {
    await logger.error(`Download failed: ${err}`)
    return false
  }
}

/**
 * UPLOAD: Copy saves from local save directory to iCloud cloud save directory.
 * Before uploading, backs up both local saves and cloud saves.
 */
export async function upload(config: AppConfig): Promise<boolean> {
  const { saveDir, cloudSaveDir, backupDir } = config

  await logger.info('=== UPLOAD: Local → iCloud ===')

  // Check local save exists and has content
  if (!existsSync(saveDir)) {
    await logger.warn('Local save directory does not exist.')
    await logger.warn('Skipping upload. Please play Balatro at least once to create a save.')
    return false
  }

  const localEntries = await readdir(saveDir)
  if (localEntries.length === 0) {
    await logger.warn('Local save directory is empty.')
    await logger.warn('Skipping upload. No local save found.')
    return false
  }

  // Backup cloud saves before overwriting
  await logger.info('Backing up cloud saves before upload...')
  await createBackup(cloudSaveDir, backupDir, 'cloud-before-upload')

  // Backup local saves for safety
  await logger.info('Backing up local saves...')
  await createBackup(saveDir, backupDir, 'local-before-upload')

  // Ensure cloud save directory exists
  await mkdir(cloudSaveDir, { recursive: true })

  // Clear cloud save directory and copy local saves
  try {
    const cloudEntries = await readdir(cloudSaveDir)
    for (const entry of cloudEntries) {
      await rm(`${cloudSaveDir}/${entry}`, { recursive: true, force: true })
    }

    await cp(saveDir, cloudSaveDir, { recursive: true })

    const newEntries = await readdir(cloudSaveDir)
    await logger.info(`Upload complete: ${newEntries.length} items synced.`)
    return true
  } catch (err) {
    await logger.error(`Upload failed: ${err}`)
    return false
  }
}

/**
 * Recursively compute the total size of a directory in bytes.
 */
async function getDirSize(dirPath: string): Promise<number> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    let total = 0
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += await getDirSize(fullPath)
      } else {
        const fileStat = await stat(fullPath)
        total += fileStat.size
      }
    }
    return total
  } catch (err) {
    await logger.warn(`Failed to compute dir size for ${dirPath}: ${err}`)
    return 0
  }
}

/**
 * Count files in a directory recursively.
 */
async function countFiles(dirPath: string): Promise<number> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    let count = 0
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        count += await countFiles(fullPath)
      } else {
        count++
      }
    }
    return count
  } catch (err) {
    await logger.warn(`Failed to count files in ${dirPath}: ${err}`)
    return 0
  }
}

/**
 * Compute a combined SHA-256 hash of all files in a directory (recursive, sorted).
 * Returns a short hex string (first 16 chars) or null if the directory is empty/missing.
 */
async function getDirHash(dirPath: string): Promise<string | null> {
  try {
    const hash = createHash('sha256')
    await hashDir(dirPath, dirPath, hash)
    return hash.digest('hex').slice(0, 16)
  } catch (err) {
    await logger.warn(`Failed to compute dir hash for ${dirPath}: ${err}`)
    return null
  }
}

/**
 * Recursively feed file contents into a hash, sorted by relative path for determinism.
 */
async function hashDir(
  basePath: string,
  dirPath: string,
  hash: ReturnType<typeof createHash>
): Promise<void> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  // Sort entries by name for deterministic ordering
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const relativePath = fullPath.slice(basePath.length)
    if (entry.isDirectory()) {
      await hashDir(basePath, fullPath, hash)
    } else {
      // Include relative path in hash so renames are detected
      hash.update(relativePath)
      const content = await readFile(fullPath)
      hash.update(content)
    }
  }
}

export interface DiffResult {
  localExists: boolean
  cloudExists: boolean
  localMtime: Date | null
  cloudMtime: Date | null
  localSize: number
  cloudSize: number
  localFileCount: number
  cloudFileCount: number
  localHash: string | null
  cloudHash: string | null
  /** Errors encountered during diff (e.g. iCloud access issues) */
  errors: string[]
}

/**
 * Read directory entries with retry for iCloud directories that may be temporarily unavailable.
 */
async function readdirWithRetry(
  dirPath: string,
  options: { withFileTypes: true },
  retries = 2,
  delayMs = 500
): Promise<Dirent[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await readdir(dirPath, options)
    } catch (err) {
      if (attempt < retries) {
        await logger.warn(
          `readdir failed for ${dirPath} (attempt ${attempt + 1}/${retries + 1}): ${err}. Retrying in ${delayMs}ms...`
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      } else {
        throw err
      }
    }
  }
  // Unreachable, but makes TypeScript happy
  throw new Error(`readdir failed after ${retries + 1} attempts`)
}

/**
 * Compare local saves and cloud saves, returning metadata about both.
 */
export async function diff(config: AppConfig): Promise<DiffResult> {
  const { saveDir, cloudSaveDir } = config
  const errors: string[] = []

  const localExists = existsSync(saveDir)
  const cloudExists = existsSync(cloudSaveDir)

  // Pre-check: try to read the cloud directory to warm up iCloud access
  if (cloudExists) {
    try {
      await readdirWithRetry(cloudSaveDir, { withFileTypes: true })
    } catch (err) {
      const errStr = String(err)
      const isPermError = errStr.includes('EPERM') || errStr.includes('EACCES')
      const msg = `Cannot read iCloud directory: ${err}`
      errors.push(msg)
      await logger.error(msg)

      if (isPermError) {
        const hint =
          'This is likely caused by macOS privacy restrictions. Fix: System Settings → Privacy & Security → Full Disk Access → Add your terminal app (Terminal.app / iTerm2 / etc.)'
        errors.push(hint)
        await logger.warn(hint)
      }
    }
  }

  const [
    localMtime,
    cloudMtime,
    localSize,
    cloudSize,
    localFileCount,
    cloudFileCount,
    localHash,
    cloudHash
  ] = await Promise.all([
    localExists ? getLatestMtime(saveDir) : Promise.resolve(null),
    cloudExists ? getLatestMtime(cloudSaveDir) : Promise.resolve(null),
    localExists ? getDirSize(saveDir) : Promise.resolve(0),
    cloudExists ? getDirSize(cloudSaveDir) : Promise.resolve(0),
    localExists ? countFiles(saveDir) : Promise.resolve(0),
    cloudExists ? countFiles(cloudSaveDir) : Promise.resolve(0),
    localExists ? getDirHash(saveDir) : Promise.resolve(null),
    cloudExists ? getDirHash(cloudSaveDir) : Promise.resolve(null)
  ])

  // Detect suspicious state: directory exists but all operations returned empty
  if (cloudExists && cloudFileCount === 0 && cloudSize === 0 && !cloudHash) {
    const msg =
      'iCloud directory exists but appears empty — this may indicate iCloud sync is in progress or a temporary access issue. Try again in a moment.'
    if (!errors.length) {
      errors.push(msg)
    }
    await logger.warn(msg)
  }

  return {
    localExists,
    cloudExists,
    localMtime,
    cloudMtime,
    localSize,
    cloudSize,
    localFileCount,
    cloudFileCount,
    localHash,
    cloudHash,
    errors
  }
}

/**
 * Format the diff result for display.
 */
export function formatDiff(result: DiffResult): string {
  const lines: string[] = []

  // Determine which side is newer
  let localLabel = 'Local'
  let cloudLabel = 'Cloud (iCloud)'
  if (result.localMtime && result.cloudMtime) {
    if (result.localMtime > result.cloudMtime) {
      localLabel = 'Local ★ Newer'
    } else if (result.cloudMtime > result.localMtime) {
      cloudLabel = 'Cloud ★ Newer'
    }
  }

  // Check if saves are identical by hash
  const identical = result.localHash && result.cloudHash && result.localHash === result.cloudHash

  lines.push('┌──────────┬──────────────────────────┬──────────────────────────┐')
  lines.push(`│          │ ${localLabel.padEnd(24)} │ ${cloudLabel.padEnd(24)} │`)
  lines.push('├──────────┼──────────────────────────┼──────────────────────────┤')

  // Status
  const localStatus = result.localExists
    ? result.localFileCount > 0
      ? 'Available'
      : 'Empty'
    : 'Not found'
  const cloudStatus = result.cloudExists
    ? result.cloudFileCount > 0
      ? 'Available'
      : 'Empty'
    : 'Not found'
  lines.push(`│ Status   │ ${localStatus.padEnd(24)} │ ${cloudStatus.padEnd(24)} │`)

  // File count
  const localCount = result.localExists ? `${result.localFileCount} files` : '-'
  const cloudCount = result.cloudExists ? `${result.cloudFileCount} files` : '-'
  lines.push(`│ Files    │ ${localCount.padEnd(24)} │ ${cloudCount.padEnd(24)} │`)

  // Size
  const localSizeStr = result.localExists ? formatBytes(result.localSize) : '-'
  const cloudSizeStr = result.cloudExists ? formatBytes(result.cloudSize) : '-'
  lines.push(`│ Size     │ ${localSizeStr.padEnd(24)} │ ${cloudSizeStr.padEnd(24)} │`)

  // Modified time
  const localTimeStr = result.localMtime ? formatDateTime(result.localMtime) : '-'
  const cloudTimeStr = result.cloudMtime ? formatDateTime(result.cloudMtime) : '-'
  lines.push(`│ Modified │ ${localTimeStr.padEnd(24)} │ ${cloudTimeStr.padEnd(24)} │`)

  // Hash
  const localHashStr = result.localHash ?? '-'
  const cloudHashStr = result.cloudHash ?? '-'
  lines.push(`│ Hash     │ ${localHashStr.padEnd(24)} │ ${cloudHashStr.padEnd(24)} │`)

  lines.push('└──────────┴──────────────────────────┴──────────────────────────┘')

  // Summary
  if (identical) {
    lines.push('')
    lines.push('✔ Saves are identical (same hash).')
  } else if (result.localMtime && result.cloudMtime) {
    if (result.localMtime > result.cloudMtime) {
      lines.push('')
      lines.push('→ Local save is NEWER than cloud save.')
    } else if (result.cloudMtime > result.localMtime) {
      lines.push('')
      lines.push('→ Cloud save is NEWER than local save.')
    } else {
      lines.push('')
      lines.push('→ Same modification time but different content.')
    }
  }

  // Show errors/warnings
  if (result.errors && result.errors.length > 0) {
    lines.push('')
    for (const err of result.errors) {
      lines.push(`⚠ ${err}`)
    }
  }

  return lines.join('\n')
}
