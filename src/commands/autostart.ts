import process from 'node:process'
import type { CAC } from 'cac'
import pc from 'picocolors'
import { disableAutostart, enableAutostart, isAutostartEnabled } from '@/utils/autostart'

export function registerAutostartCommand(cli: CAC): void {
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
}
