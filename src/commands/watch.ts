import process from 'node:process'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { CAC } from 'cac'
import pc from 'picocolors'
import { ensureConfig } from '@/utils/config'
import { getDaemonLogPath, getLogDir, getPidFilePath } from '@/utils/constants'
import { logger } from '@/utils/logger'
import { backgroundAutoUpdate } from '@/utils/updater'
import { getWatcherStatus, startWatcher } from '@/utils/watcher'

// ─── daemon helpers ──────────────────────────────────────

/**
 * Check if a daemon watcher is alive by reading the PID file.
 * Returns the PID if alive, null otherwise.
 */
function getDaemonPid(): number | null {
  const pidFile = getPidFilePath()
  if (!existsSync(pidFile)) return null
  const pid = Number.parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
  if (Number.isNaN(pid)) return null
  try {
    // signal 0 tests if the process exists without killing it
    process.kill(pid, 0)
    return pid
  } catch {
    // Process not running, clean up stale PID file
    try {
      unlinkSync(pidFile)
    } catch {}
    return null
  }
}

// ─── subcommand handlers ─────────────────────────────────

function handleStop() {
  const pid = getDaemonPid()
  if (!pid) {
    console.log(pc.yellow('No background watcher is running.'))
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
    try {
      unlinkSync(getPidFilePath())
    } catch {}
    console.log(pc.green(`Watcher (PID ${pid}) stopped.`))
  } catch (err) {
    console.error(pc.red(`Failed to stop watcher (PID ${pid}): ${err}`))
    process.exit(1)
  }
}

function handleStatus() {
  // Check daemon first
  const daemonPid = getDaemonPid()
  if (daemonPid) {
    console.log(pc.green(`Background watcher is running (PID ${daemonPid}).`))
    console.log(pc.dim(`PID file: ${getPidFilePath()}`))
    console.log(pc.dim(`Daemon log: ${getDaemonLogPath()}`))
    console.log(pc.dim('Run `balatro-saves-sync watch stop` to stop it.'))
    return
  }

  // Check in-process watcher
  const status = getWatcherStatus()
  if (!status.running) {
    console.log(pc.yellow('Watcher is not running.'))
    console.log(pc.dim('Run `balatro-saves-sync watch` to start the watcher.'))
  } else {
    console.log(pc.green('Watcher is running (foreground).'))
    console.log(`  Game running:  ${status.gameRunning ? pc.green('Yes') : pc.dim('No')}`)
    console.log(`  Poll interval: ${status.pollInterval}ms`)
    console.log(`  Uptime:        ${Math.floor((Date.now() - status.startedAt!) / 1000)}s`)
  }
}

async function handleDaemon() {
  // Check if already running
  const existingPid = getDaemonPid()
  if (existingPid) {
    console.log(pc.yellow(`Watcher is already running in background (PID ${existingPid}).`))
    console.log(pc.dim('Run `balatro-saves-sync watch stop` to stop it first.'))
    return
  }

  // Ensure config exists before spawning (so the daemon doesn't need interactive input)
  await ensureConfig()

  // Ensure log directory exists
  mkdirSync(getLogDir(), { recursive: true })
  const logPath = getDaemonLogPath()
  const logFd = openSync(logPath, 'a')

  // Spawn a detached child process running `watch` in foreground mode
  const child = spawn(process.execPath, ['watch'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
    cwd: process.cwd()
  })

  child.unref()

  // Write PID file
  const pidFile = getPidFilePath()
  mkdirSync(dirname(pidFile), { recursive: true })
  writeFileSync(pidFile, String(child.pid), 'utf-8')

  console.log(pc.green(`Watcher started in background (PID ${child.pid}).`))
  console.log(pc.dim(`Logs: ${logPath}`))
  console.log(pc.dim(`PID file: ${pidFile}`))
  console.log(pc.dim('Run `balatro-saves-sync watch stop` to stop it.'))
  process.exit(0)
}

async function handleForeground() {
  const config = await ensureConfig()
  await logger.info('Balatro Saves Sync - Watcher started')
  await logger.info(`Save dir:       ${config.saveDir}`)
  await logger.info(`Cloud save dir: ${config.cloudSaveDir}`)
  await logger.info(`Backup dir:     ${config.backupDir}`)
  await logger.info(`Log dir:        ${getLogDir()}`)

  // Background auto-update check (non-blocking)
  backgroundAutoUpdate().catch(() => {})

  const stop = await startWatcher(config)

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('')
    await logger.info('Shutting down watcher...')
    stop()
    // Clean up PID file if it exists (e.g. if spawned as daemon child)
    try {
      unlinkSync(getPidFilePath())
    } catch {}
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// ─── register ────────────────────────────────────────────

export function registerWatchCommand(cli: CAC): void {
  cli
    .command('watch [action]', 'Watch for Balatro launch/exit and auto-sync saves')
    .option('-d, --daemon', 'Run the watcher in the background (daemon mode)')
    .example('  $ balatro-saves-sync watch              Start the watcher')
    .example('  $ balatro-saves-sync watch -d           Start watcher in background')
    .example('  $ balatro-saves-sync watch status       Show watcher status')
    .example('  $ balatro-saves-sync watch stop         Stop the background watcher')
    .action(async (action: string | undefined, options: { daemon?: boolean }) => {
      if (action === 'stop') return handleStop()
      if (action === 'status') return handleStatus()
      if (options.daemon) return handleDaemon()
      return handleForeground()
    })
}
