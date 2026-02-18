import AutoLaunch from 'auto-launch'
import { existsSync } from 'node:fs'
import { logger } from './logger'
import { APP_NAME, getInstalledBinaryPath } from './constants'

let _launcher: AutoLaunch | null = null

/**
 * Get the path to use for autostart registration.
 * Prefers the installed binary at ~/.local/bin, falls back to process.execPath.
 */
function getLauncherPath(): string {
  const installed = getInstalledBinaryPath()
  if (existsSync(installed)) return installed
  return process.execPath
}

function getLauncher(): AutoLaunch {
  if (!_launcher) {
    _launcher = new AutoLaunch({
      name: APP_NAME,
      path: getLauncherPath(),
      args: ['watch'],
      isHidden: false,
      mac: {
        useLaunchAgent: true
      }
    })
  }
  return _launcher
}

export async function enableAutostart(): Promise<void> {
  await logger.info('Enabling auto-start...')
  const launcher = getLauncher()
  await launcher.enable()
  await logger.info('Auto-start enabled successfully')
}

export async function disableAutostart(): Promise<void> {
  await logger.info('Disabling auto-start...')
  const launcher = getLauncher()
  await launcher.disable()
  await logger.info('Auto-start disabled successfully')
}

export async function isAutostartEnabled(): Promise<boolean> {
  const launcher = getLauncher()
  return launcher.isEnabled()
}
