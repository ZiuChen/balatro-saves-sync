import process from 'node:process'
import cac from 'cac'
import pc from 'picocolors'
import { disableAutostart, enableAutostart, isAutostartEnabled } from './autostart'
import { ensureConfig, getConfigValue, listConfig, runSetupWizard, setConfigValue } from './config'
import { APP_VERSION, getConfigFilePath, getLogDir } from './constants'
import { logger } from './logger'
import { download, upload } from './sync'
import { startWatcher } from './watcher'

const cli = cac('balatro-saves-sync')

// ─── watch ───────────────────────────────────────────────
cli.command('watch', 'Watch for Balatro launch/exit and auto-sync saves').action(async () => {
  const config = await ensureConfig()
  await logger.info('Balatro Saves Sync - Watcher started')
  await logger.info(`Save dir:       ${config.saveDir}`)
  await logger.info(`Cloud save dir: ${config.cloudSaveDir}`)
  await logger.info(`Backup dir:     ${config.backupDir}`)
  await logger.info(`Log dir:        ${getLogDir()}`)

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
  const config = await ensureConfig()
  const success = await upload(config)
  process.exit(success ? 0 : 1)
})

// ─── download ────────────────────────────────────────────
cli.command('download', 'Download saves from iCloud to local').action(async () => {
  const config = await ensureConfig()
  const success = await download(config)
  process.exit(success ? 0 : 1)
})

// ─── config get ──────────────────────────────────────────
cli.command('config get [key]', 'Get a config value (or list all)').action(async (key?: string) => {
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
cli.command('setup', 'Run interactive setup wizard').action(async () => {
  await runSetupWizard()
})

// ─── autostart ───────────────────────────────────────────
cli
  .command('autostart [action]', 'Manage system auto-start (enable/disable/status)')
  .action(async (action?: string) => {
    switch (action) {
      case 'enable': {
        try {
          await enableAutostart()
          console.log(pc.green('✅ 开机自启已启用'))
        } catch (err) {
          console.error(pc.red(`Failed to enable autostart: ${err}`))
          process.exit(1)
        }
        break
      }
      case 'disable': {
        try {
          await disableAutostart()
          console.log(pc.green('✅ 开机自启已禁用'))
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
          console.log(pc.green('✅ 开机自启: 已启用'))
        } else {
          console.log(pc.yellow('❌ 开机自启: 未启用'))
          console.log(pc.dim('运行 `balatro-saves-sync autostart enable` 启用'))
        }
        break
      }
    }
  })

// ─── default / help ──────────────────────────────────────
cli.help()
cli.version(APP_VERSION)

// Parse and run
cli.parse()
