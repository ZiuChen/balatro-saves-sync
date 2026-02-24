/**
 * Shared pure helper functions.
 */

import { readdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'

/**
 * Format a byte count into a human-readable string (e.g. "1.5 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

/**
 * Compare two semver version strings.
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/**
 * Return the short display name for a path (last directory component).
 */
export function shortPath(fullPath: string): string {
  return basename(fullPath)
}

/**
 * Format a Date into a locale-friendly datetime string.
 */
export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const mo = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const mi = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

/**
 * Get the latest modification time across all files in a directory (recursive).
 * Returns null if the directory doesn't exist or is empty.
 */
export async function getLatestMtime(dirPath: string): Promise<Date | null> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    let latest: Date | null = null
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const subLatest = await getLatestMtime(fullPath)
        if (subLatest && (!latest || subLatest > latest)) {
          latest = subLatest
        }
      } else {
        try {
          const fileStat = await stat(fullPath)
          if (!latest || fileStat.mtime > latest) {
            latest = fileStat.mtime
          }
        } catch {
          // Skip files that can't be stat'd (e.g. iCloud .icloud placeholders)
        }
      }
    }
    return latest
  } catch (err) {
    // Log the error for debugging instead of silently swallowing
    console.error(`[getLatestMtime] Failed to read ${dirPath}: ${err}`)
    return null
  }
}
