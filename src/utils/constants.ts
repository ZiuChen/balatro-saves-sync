import { arch, homedir, platform } from 'node:os'
import { join } from 'node:path'
import pkg from '../../package.json'

export const APP_NAME = 'balatro-saves-sync'
export const APP_VERSION: string = pkg.version

export const GITHUB_OWNER = 'ZiuChen'
export const GITHUB_REPO = 'balatro-saves-sync'
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`
export const GITHUB_API_RELEASES = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`

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

// ─── Distribution & Install Paths ────────────────────────

/**
 * Get the install data directory: ~/.local/share/balatro-saves-sync
 */
export function getInstallDir(): string {
  return join(homedir(), '.local', 'share', APP_NAME)
}

/**
 * Get the binary install directory: ~/.local/bin
 */
export function getBinDir(): string {
  return join(homedir(), '.local', 'bin')
}

/**
 * Get the installed binary path: ~/.local/bin/balatro-saves-sync[.exe]
 */
export function getInstalledBinaryPath(): string {
  const ext = platform() === 'win32' ? '.exe' : ''
  return join(getBinDir(), `${APP_NAME}${ext}`)
}

/**
 * Get the platform key for binary distribution (e.g., "darwin-arm64").
 */
export function getPlatformKey(): string {
  const os = platform() === 'win32' ? 'win32' : platform()
  const a = arch() === 'arm64' ? 'arm64' : 'x64'
  return `${os}-${a}`
}

/**
 * Get the binary asset name for the current platform.
 */
export function getBinaryAssetName(plt?: string): string {
  const key = plt || getPlatformKey()
  const ext = key.startsWith('win32') ? '.exe' : ''
  return `${APP_NAME}-${key}${ext}`
}

/**
 * Get the PID file path for the daemon watcher: ~/.balatro-saves-sync/watcher.pid
 */
export function getPidFilePath(): string {
  return join(getConfigDir(), 'watcher.pid')
}

/**
 * Get the daemon log file path: <logDir>/daemon.log
 */
export function getDaemonLogPath(): string {
  return join(getLogDir(), 'daemon.log')
}
