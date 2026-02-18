import { cp, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@/utils/logger'

/**
 * Create a timestamped backup of a directory.
 * The backup is placed inside the target backup root as a subfolder named by timestamp.
 */
export async function createBackup(
  sourceDir: string,
  backupRoot: string,
  label: string
): Promise<string | null> {
  if (!existsSync(sourceDir)) {
    await logger.warn(`Backup source does not exist: ${sourceDir}`)
    return null
  }

  // Check if source directory has content
  const entries = await readdir(sourceDir)
  if (entries.length === 0) {
    await logger.warn(`Backup source is empty: ${sourceDir}`)
    return null
  }

  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const folderName = `${label}_${timestamp}`
  const backupPath = join(backupRoot, folderName)

  await mkdir(backupPath, { recursive: true })

  await logger.info(`Creating backup: ${sourceDir} → ${backupPath}`)

  await cp(sourceDir, backupPath, { recursive: true })

  // Verify backup
  const backupEntries = await readdir(backupPath)
  if (backupEntries.length === 0) {
    await logger.error(`Backup verification failed: ${backupPath} is empty`)
    return null
  }

  const totalSize = await getDirSize(backupPath)
  await logger.info(`Backup created successfully: ${backupPath} (${formatBytes(totalSize)})`)
  return backupPath
}

async function getDirSize(dirPath: string): Promise<number> {
  let totalSize = 0
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      totalSize += await getDirSize(fullPath)
    } else {
      const fileStat = await stat(fullPath)
      totalSize += fileStat.size
    }
  }
  return totalSize
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}
