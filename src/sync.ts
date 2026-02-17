import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { AppConfig } from './config'
import { createBackup } from './backup'
import { logger } from './logger'

/**
 * DOWNLOAD: Copy saves from iCloud cloud save directory to local save directory.
 * Before downloading, backs up both local saves and cloud saves.
 */
export async function download(config: AppConfig): Promise<boolean> {
  const { saveDir, cloudSaveDir, backupDir } = config

  await logger.info('=== DOWNLOAD: iCloud → Local ===')

  // Check cloud save exists and has content
  if (!existsSync(cloudSaveDir)) {
    await logger.warn(`Cloud save directory does not exist: ${cloudSaveDir}`)
    await logger.warn(
      'Skipping download. Please upload a save first or check your iCloud directory.'
    )
    return false
  }

  const cloudEntries = await readdir(cloudSaveDir)
  if (cloudEntries.length === 0) {
    await logger.warn(`Cloud save directory is empty: ${cloudSaveDir}`)
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
    await logger.info(`Download complete: ${newEntries.length} items synced to ${saveDir}`)
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
    await logger.warn(`Local save directory does not exist: ${saveDir}`)
    await logger.warn('Skipping upload. Please play Balatro at least once to create a save.')
    return false
  }

  const localEntries = await readdir(saveDir)
  if (localEntries.length === 0) {
    await logger.warn(`Local save directory is empty: ${saveDir}`)
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
    await logger.info(`Upload complete: ${newEntries.length} items synced to ${cloudSaveDir}`)
    return true
  } catch (err) {
    await logger.error(`Upload failed: ${err}`)
    return false
  }
}
