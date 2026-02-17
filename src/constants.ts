import { homedir, platform } from 'node:os'
import { join } from 'node:path'

export const APP_NAME = 'balatro-saves-sync'
export const APP_VERSION = '0.1.0'

export const BALATRO_PROCESS_NAMES = [
  'Balatro',
  'Balatro.exe',
  'balatro',
  'love' // Balatro uses LÖVE engine
]

/**
 * Get the default Balatro save directory based on the current platform.
 */
export function getDefaultSaveDir(): string {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Balatro')
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Balatro')
    case 'linux':
      return join(home, '.local', 'share', 'Balatro')
    default:
      return join(home, '.balatro')
  }
}

/**
 * Get the default iCloud Drive directory based on the current platform.
 */
export function getDefaultICloudDir(): string {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
    case 'win32':
      return join(home, 'iCloudDrive')
    default:
      return join(home, 'iCloudDrive')
  }
}

/**
 * Get the default iCloud cloud save directory.
 */
export function getDefaultCloudSaveDir(): string {
  return join(getDefaultICloudDir(), 'Balatro Cloud Save')
}

/**
 * Get the default iCloud backup directory.
 */
export function getDefaultBackupDir(): string {
  return join(getDefaultICloudDir(), 'Balatro Backup Saves')
}

/**
 * Get the config directory path: ~/.balatro-saves-sync
 */
export function getConfigDir(): string {
  return join(homedir(), `.${APP_NAME}`)
}

/**
 * Get the config file path.
 */
export function getConfigFilePath(): string {
  return join(getConfigDir(), 'config.json')
}

/**
 * Get the system logs directory for this app.
 */
export function getLogDir(): string {
  const home = homedir()
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Logs', APP_NAME)
    case 'win32':
      return join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), APP_NAME, 'logs')
    case 'linux':
      return join(home, '.local', 'state', APP_NAME, 'logs')
    default:
      return join(home, `.${APP_NAME}`, 'logs')
  }
}
