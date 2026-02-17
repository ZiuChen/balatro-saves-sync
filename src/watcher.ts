import { exec } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'
import type { AppConfig } from './config'
import { BALATRO_PROCESS_NAMES } from './constants'
import { logger } from './logger'
import { download, upload } from './sync'

const execAsync = promisify(exec)

/**
 * Check if Balatro is currently running.
 */
async function isBalatroRunning(): Promise<boolean> {
  try {
    const os = platform()
    let cmd: string

    if (os === 'darwin' || os === 'linux') {
      // Use pgrep for Unix-like systems
      const patterns = BALATRO_PROCESS_NAMES.join('|')
      cmd = `pgrep -i -f "${patterns}" || true`
    } else if (os === 'win32') {
      // Use tasklist for Windows
      cmd = `tasklist /FI "IMAGENAME eq Balatro.exe" /NH`
    } else {
      await logger.warn(`Unsupported platform for process detection: ${os}`)
      return false
    }

    const { stdout } = await execAsync(cmd)
    const output = stdout.trim()

    if (os === 'win32') {
      return output.toLowerCase().includes('balatro')
    }

    // On Unix, pgrep returns PIDs if found, empty otherwise
    return output.length > 0
  } catch {
    return false
  }
}

export interface WatcherOptions {
  onGameStart?: () => Promise<void>
  onGameStop?: () => Promise<void>
}

/**
 * Start watching for Balatro process launch and exit.
 * Triggers download on game start, upload on game stop.
 */
export async function startWatcher(config: AppConfig): Promise<() => void> {
  let wasRunning = false
  let isProcessing = false
  let stopped = false

  await logger.info(`Starting watcher (polling every ${config.pollInterval}ms)...`)

  // Check initial state
  wasRunning = await isBalatroRunning()
  if (wasRunning) {
    await logger.info('Balatro is currently running.')
  } else {
    await logger.info('Balatro is not running. Waiting for game to launch...')
  }

  const intervalId = setInterval(async () => {
    if (stopped || isProcessing) return

    try {
      const isRunning = await isBalatroRunning()

      if (isRunning && !wasRunning) {
        // Game just started
        isProcessing = true
        await logger.info('🎮 Balatro launched! Triggering DOWNLOAD...')
        try {
          await download(config)
        } catch (err) {
          await logger.error(`Download on game start failed: ${err}`)
        }
        wasRunning = true
        isProcessing = false
      } else if (!isRunning && wasRunning) {
        // Game just stopped
        isProcessing = true
        await logger.info('🛑 Balatro closed! Triggering UPLOAD...')
        try {
          await upload(config)
        } catch (err) {
          await logger.error(`Upload on game stop failed: ${err}`)
        }
        wasRunning = false
        isProcessing = false
      }
    } catch (err) {
      await logger.error(`Watcher error: ${err}`)
    }
  }, config.pollInterval)

  // Return stop function
  return () => {
    stopped = true
    clearInterval(intervalId)
    logger.info('Watcher stopped.')
  }
}
