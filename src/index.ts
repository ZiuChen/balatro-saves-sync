import process from 'node:process'
import cac from 'cac'
import pc from 'picocolors'
import { disableAutostart, enableAutostart, isAutostartEnabled } from './autostart'
import { ensureConfig, getConfigValue, listConfig, runSetupWizard, setConfigValue } from './config'
import { APP_VERSION, getConfigFilePath, getLogDir } from './constants'
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

// ─── watch ───────────────────────────────────────────────
cli
  .command('watch [action]', 'Watch for Balatro launch/exit and auto-sync saves (action: status)')
  .action(async (action?: string) => {
    if (action === 'status') {
      const status = getWatcherStatus()
      if (!status.running) {
        console.log(pc.yellow('Watcher is not running in this process.'))
        console.log(pc.dim('Run `balatro-saves-sync watch` to start the watcher.'))
      } else {
        console.log(pc.green('Watcher is running.'))
        console.log(`  Game running:  ${status.gameRunning ? pc.green('Yes') : pc.dim('No')}`)
        console.log(`  Poll interval: ${status.pollInterval}ms`)
        console.log(`  Uptime:        ${Math.floor((Date.now() - status.startedAt!) / 1000)}s`)
      }
      return
    }

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
  .command('autostart [action]', 'Manage system auto-start (action: enable / disable / status)')
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
