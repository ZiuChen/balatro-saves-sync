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
  /** Current effective interval (adapts based on game state) */
  currentInterval: number
  startedAt: number | null
}

/** Multiplier applied to pollInterval when the game is not running. */
const IDLE_POLL_MULTIPLIER = 3

let _watcherStatus: WatcherStatusInfo = {
  running: false,
  gameRunning: false,
  pollInterval: 0,
  currentInterval: 0,
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

  const idleInterval = config.pollInterval * IDLE_POLL_MULTIPLIER
  const activeInterval = config.pollInterval

  await logger.info(
    `Starting watcher (adaptive polling: ${activeInterval}ms active / ${idleInterval}ms idle)...`
  )

  _watcherStatus = {
    running: true,
    gameRunning: false,
    pollInterval: config.pollInterval,
    currentInterval: idleInterval,
    startedAt: Date.now()
  }

  // Check initial state
  wasRunning = await checkProcess()
  _watcherStatus.gameRunning = wasRunning
  _watcherStatus.currentInterval = wasRunning ? activeInterval : idleInterval
  if (wasRunning) {
    await logger.info('Balatro is currently running.')
  } else {
    await logger.info('Balatro is not running. Waiting for game to launch...')
  }

  let timerId: ReturnType<typeof setTimeout>

  async function poll() {
    if (stopped || isProcessing) {
      if (!stopped) schedulePoll()
      return
    }

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
        _watcherStatus.currentInterval = activeInterval
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
        _watcherStatus.currentInterval = idleInterval
        isProcessing = false
      }
    } catch (err) {
      await logger.error(`Watcher error: ${err}`)
    }

    if (!stopped) schedulePoll()
  }

  function schedulePoll() {
    const interval = wasRunning ? activeInterval : idleInterval
    timerId = setTimeout(poll, interval)
  }

  // Start the polling loop
  schedulePoll()

  // Return stop function
  return () => {
    stopped = true
    clearTimeout(timerId)
    _watcherStatus = {
      running: false,
      gameRunning: false,
      pollInterval: 0,
      currentInterval: 0,
      startedAt: null
    }
    logger.info('Watcher stopped.')
  }
}
