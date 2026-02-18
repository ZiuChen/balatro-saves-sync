import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { confirm, input } from '@inquirer/prompts'
import {
  getConfigDir,
  getConfigFilePath,
  getDefaultBackupDir,
  getDefaultCloudSaveDir,
  getDefaultSaveDir
} from './constants'
import { logger } from './logger'
import { enableAutostart, isAutostartEnabled } from './autostart'

export interface AppConfig {
  /** Local Balatro save directory */
  saveDir: string
  /** iCloud cloud save directory (shared between devices) */
  cloudSaveDir: string
  /** iCloud backup directory */
  backupDir: string
  /** Polling interval in milliseconds for watching the process */
  pollInterval: number
}

const DEFAULT_POLL_INTERVAL = 3000

function getDefaultConfig(): AppConfig {
  return {
    saveDir: getDefaultSaveDir(),
    cloudSaveDir: getDefaultCloudSaveDir(),
    backupDir: getDefaultBackupDir(),
    pollInterval: DEFAULT_POLL_INTERVAL
  }
}

export async function loadConfig(): Promise<AppConfig | null> {
  const configPath = getConfigFilePath()
  if (!existsSync(configPath)) {
    return null
  }
  try {
    const raw = await readFile(configPath, 'utf-8')
    return { ...getDefaultConfig(), ...JSON.parse(raw) } as AppConfig
  } catch (err) {
    await logger.warn(`Failed to read config: ${err}`)
    return null
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const configPath = getConfigFilePath()
  const dir = dirname(configPath)
  await mkdir(dir, { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  await logger.info(`Config saved to ${configPath}`)
}

export async function ensureConfig(): Promise<AppConfig> {
  const existing = await loadConfig()
  if (existing) {
    return existing
  }
  return await runSetupWizard()
}

export async function runSetupWizard(): Promise<AppConfig> {
  const defaults = getDefaultConfig()

  console.log('')
  console.log('Balatro Saves Sync - Initial Setup')
  console.log('─'.repeat(40))
  console.log('')

  const saveDir = await input({
    message: 'Balatro local save directory:',
    default: defaults.saveDir
  })

  const cloudSaveDir = await input({
    message: 'iCloud cloud save directory:',
    default: defaults.cloudSaveDir
  })

  const backupDir = await input({
    message: 'iCloud backup directory:',
    default: defaults.backupDir
  })

  const pollIntervalStr = await input({
    message: 'Process detection interval (ms):',
    default: String(defaults.pollInterval)
  })

  const config: AppConfig = {
    saveDir,
    cloudSaveDir,
    backupDir,
    pollInterval: Number.parseInt(pollIntervalStr, 10) || DEFAULT_POLL_INTERVAL
  }

  await saveConfig(config)
  console.log('')
  console.log('Configuration saved!')

  // Ask about autostart
  const alreadyEnabled = await isAutostartEnabled()
  if (alreadyEnabled) {
    console.log('Autostart is already enabled.')
  } else {
    const shouldAutostart = await confirm({
      message: 'Register as a login item? (auto-run watch on system startup)',
      default: true
    })

    if (shouldAutostart) {
      try {
        await enableAutostart()
        console.log('Autostart enabled!')
      } catch (err) {
        console.log(`Warning: Failed to register autostart: ${err}`)
        console.log('   You can enable it later with `balatro-saves-sync autostart enable`')
      }
    }
  }

  console.log('')

  return config
}

export async function getConfigValue(key: string): Promise<string | undefined> {
  const config = await loadConfig()
  if (!config) {
    return undefined
  }
  return String((config as unknown as Record<string, unknown>)[key] ?? '')
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  let config = await loadConfig()
  if (!config) {
    config = getDefaultConfig()
  }
  if (!(key in config)) {
    throw new Error(`Unknown config key: ${key}. Valid keys: ${Object.keys(config).join(', ')}`)
  }

  const record = config as unknown as Record<string, unknown>
  // Coerce numeric values
  if (key === 'pollInterval') {
    record[key] = Number.parseInt(value, 10)
  } else {
    record[key] = value
  }

  await saveConfig(config)
}

export async function listConfig(): Promise<Record<string, unknown> | null> {
  const config = await loadConfig()
  return config as Record<string, unknown> | null
}

export function getConfigDirPath(): string {
  return getConfigDir()
}
