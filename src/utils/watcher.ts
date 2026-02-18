import { exec } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'
import type { AppConfig } from '@/utils/config'
import { BALATRO_PROCESS_NAMES } from '@/utils/constants'
import { logger } from '@/utils/logger'
import { download, upload } from '@/utils/sync'

const execAsync = promisify(exec)

// ─── Watcher Status ──────────────────────────────────────

interface WatcherStatusInfo {
  running: boolean
  gameRunning: boolean
  pollInterval: number
  startedAt: number | null
}

let _watcherStatus: WatcherStatusInfo = {
  running: false,
  gameRunning: false,
  pollInterval: 0,
  startedAt: null
}

export function getWatcherStatus(): WatcherStatusInfo {
  return { ..._watcherStatus }
}

/**
 * Check if Balatro is currently running.
 * Exported for testing and dependency injection.
 */
export async function isBalatroRunning(): Promise<boolean> {
  try {
    const os = platform()
    let cmd: string

    if (os === 'darwin' || os === 'linux') {
      const patterns = BALATRO_PROCESS_NAMES.join('|')
      cmd = `pgrep -i -f "${patterns}" || true`
    } else if (os === 'win32') {
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

    return output.length > 0
  } catch {
    return false
  }
}

export interface WatcherOptions {
  /** Override the process detection function (useful for testing). */
  processChecker?: () => Promise<boolean>
}

/**
 * Start watching for Balatro process launch and exit.
 * Triggers download on game start, upload on game stop.
 */
export async function startWatcher(
  config: AppConfig,
  options?: WatcherOptions
): Promise<() => void> {
  const checkProcess = options?.processChecker ?? isBalatroRunning
  let wasRunning = false
  let isProcessing = false
  let stopped = false

  await logger.info(`Starting watcher (polling every ${config.pollInterval}ms)...`)

  _watcherStatus = {
    running: true,
    gameRunning: false,
    pollInterval: config.pollInterval,
    startedAt: Date.now()
  }

  // Check initial state
  wasRunning = await checkProcess()
  _watcherStatus.gameRunning = wasRunning
  if (wasRunning) {
    await logger.info('Balatro is currently running.')
  } else {
    await logger.info('Balatro is not running. Waiting for game to launch...')
  }

  const intervalId = setInterval(async () => {
    if (stopped || isProcessing) return

    try {
      const isRunning = await checkProcess()

      if (isRunning && !wasRunning) {
        // Game just started
        isProcessing = true
        await logger.info('Game launched! Triggering download...')
        try {
          await download(config)
        } catch (err) {
          await logger.error(`Download on game start failed: ${err}`)
        }
        wasRunning = true
        _watcherStatus.gameRunning = true
        isProcessing = false
      } else if (!isRunning && wasRunning) {
        // Game just stopped
        isProcessing = true
        await logger.info('Game closed! Triggering upload...')
        try {
          await upload(config)
        } catch (err) {
          await logger.error(`Upload on game stop failed: ${err}`)
        }
        wasRunning = false
        _watcherStatus.gameRunning = false
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
    _watcherStatus = { running: false, gameRunning: false, pollInterval: 0, startedAt: null }
    logger.info('Watcher stopped.')
  }
}
