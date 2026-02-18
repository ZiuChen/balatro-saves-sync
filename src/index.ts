import process from 'node:process'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import cac from 'cac'
import pc from 'picocolors'
import { disableAutostart, enableAutostart, isAutostartEnabled } from './autostart'
import { ensureConfig, getConfigValue, listConfig, runSetupWizard, setConfigValue } from './config'
import {
  APP_VERSION,
  getConfigFilePath,
  getDaemonLogPath,
  getLogDir,
  getPidFilePath
} from './constants'
import { installBinary } from './installer'
import { logger } from './logger'
import { download, upload } from './sync'
import {
  backgroundAutoUpdate,
  checkAndNotifyUpdate,
  checkForUpdate,
  performUpdate
} from './updater'
import { getWatcherStatus, startWatcher } from './watcher'

const cli = cac('balatro-saves-sync')

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

// ─── watch ───────────────────────────────────────────────
cli
  .command('watch [action]', 'Watch for Balatro launch/exit and auto-sync saves')
  .option('-d, --daemon', 'Run the watcher in the background (daemon mode)')
  .example('  $ balatro-saves-sync watch              Start the watcher')
  .example('  $ balatro-saves-sync watch -d           Start watcher in background')
  .example('  $ balatro-saves-sync watch status       Show watcher status')
  .example('  $ balatro-saves-sync watch stop         Stop the background watcher')
  .action(async (action: string | undefined, options: { daemon?: boolean }) => {
    // ── watch stop ──
    if (action === 'stop') {
      const pid = getDaemonPid()
      if (!pid) {
        console.log(pc.yellow('No background watcher is running.'))
        return
      }
      try {
        process.kill(pid, 'SIGTERM')
        // Clean up PID file
        try {
          unlinkSync(getPidFilePath())
        } catch {}
        console.log(pc.green(`Watcher (PID ${pid}) stopped.`))
      } catch (err) {
        console.error(pc.red(`Failed to stop watcher (PID ${pid}): ${err}`))
        process.exit(1)
      }
      return
    }

    // ── watch status ──
    if (action === 'status') {
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
      return
    }

    // ── watch --daemon ──
    if (options.daemon) {
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

    // ── watch (foreground) ──
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
  })

// ─── upload ──────────────────────────────────────────────
cli.command('upload', 'Upload local saves to iCloud').action(async () => {
  checkAndNotifyUpdate().catch(() => {})
  const config = await ensureConfig()
  const success = await upload(config)
  process.exit(success ? 0 : 1)
})

// ─── download ────────────────────────────────────────────
cli.command('download', 'Download saves from iCloud to local').action(async () => {
  checkAndNotifyUpdate().catch(() => {})
  const config = await ensureConfig()
  const success = await download(config)
  process.exit(success ? 0 : 1)
})

// ─── config get ──────────────────────────────────────────
cli
  .command('config get [key]', 'Get a config value, or list all if no key given')
  .action(async (key?: string) => {
    if (!key) {
      const config = await listConfig()
      if (!config) {
        console.log(pc.yellow('No config found. Run any command to trigger setup.'))
        return
      }
      console.log('')
      console.log(pc.bold('Current configuration:'))
      console.log(pc.dim(`Config file: ${getConfigFilePath()}`))
      console.log('')
      for (const [k, v] of Object.entries(config)) {
        console.log(`  ${pc.cyan(k.padEnd(16))} ${v}`)
      }
      console.log('')
      return
    }

    const value = await getConfigValue(key)
    if (value === undefined) {
      console.log(pc.yellow('No config found.'))
      process.exit(1)
    }
    console.log(value)
  })

// ─── config set ──────────────────────────────────────────
cli
  .command('config set <key> <value>', 'Set a config value')
  .action(async (key: string, value: string) => {
    try {
      await setConfigValue(key, value)
      console.log(pc.green(`✅ ${key} = ${value}`))
    } catch (err) {
      console.error(pc.red(`${err}`))
      process.exit(1)
    }
  })

// ─── setup ───────────────────────────────────────────────
cli
  .command('setup', 'Run interactive setup wizard for first-time configuration')
  .action(async () => {
    await runSetupWizard()
  })

// ─── autostart ───────────────────────────────────────────
cli
  .command('autostart [action]', 'Manage system auto-start')
  .example('  $ balatro-saves-sync autostart           Show current status')
  .example('  $ balatro-saves-sync autostart enable    Enable auto-start')
  .example('  $ balatro-saves-sync autostart disable   Disable auto-start')
  .example('  $ balatro-saves-sync autostart status    Show current status')
  .action(async (action?: string) => {
    switch (action) {
      case 'enable': {
        try {
          await enableAutostart()
          console.log(pc.green('Autostart enabled.'))
        } catch (err) {
          console.error(pc.red(`Failed to enable autostart: ${err}`))
          process.exit(1)
        }
        break
      }
      case 'disable': {
        try {
          await disableAutostart()
          console.log(pc.green('Autostart disabled.'))
        } catch (err) {
          console.error(pc.red(`Failed to disable autostart: ${err}`))
          process.exit(1)
        }
        break
      }
      case 'status':
      default: {
        const enabled = await isAutostartEnabled()
        if (enabled) {
          console.log(pc.green('Autostart: enabled'))
        } else {
          console.log(pc.yellow('Autostart: disabled'))
          console.log(pc.dim('Run `balatro-saves-sync autostart enable` to enable.'))
        }
        break
      }
    }
  })

// ─── logs ────────────────────────────────────────────────
cli.command('logs', 'Open the log directory in file manager').action(async () => {
  const { exec } = await import('node:child_process')
  const logDir = getLogDir()
  const os = process.platform
  let cmd: string
  if (os === 'darwin') {
    cmd = `open "${logDir}"`
  } else if (os === 'win32') {
    cmd = `explorer "${logDir}"`
  } else {
    cmd = `xdg-open "${logDir}"`
  }
  console.log(`Log directory: ${logDir}`)
  exec(cmd, (err) => {
    if (err) {
      console.error(pc.red(`Failed to open log directory: ${err.message}`))
      process.exit(1)
    }
  })
})

// ─── install ─────────────────────────────────────────────
cli.command('install', 'Install binary to ~/.local/bin and set up PATH').action(async () => {
  await installBinary()
})

// ─── update ──────────────────────────────────────────────
cli.command('update', 'Check for updates and install the latest version').action(async () => {
  console.log(pc.dim(`Current version: v${APP_VERSION}`))
  console.log(pc.dim('Checking for updates...'))
  console.log('')

  const { available, latestVersion } = await checkForUpdate()
  if (!available || !latestVersion) {
    console.log(pc.green('✅ Already up to date!'))
    return
  }

  console.log(`New version available: ${pc.cyan(`v${latestVersion}`)}`)
  console.log('')

  const success = await performUpdate(latestVersion)
  if (success) {
    console.log('')
    console.log(pc.green(`✅ Updated to v${latestVersion}!`))
    console.log(pc.dim('Restart any running instances to apply.'))
  } else {
    console.error(pc.red('Update failed. Check the logs for details.'))
    process.exit(1)
  }
})

// ─── default / help ──────────────────────────────────────
cli.help()
cli.version(APP_VERSION)

// Parse and run
cli.parse()
