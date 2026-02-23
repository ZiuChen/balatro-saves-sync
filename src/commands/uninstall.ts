import process from 'node:process'
import type { CAC } from 'cac'
import pc from 'picocolors'
import { confirm } from '@inquirer/prompts'
import { uninstallBinary } from '@/utils/uninstaller'

export function registerUninstallCommand(cli: CAC): void {
  cli
    .command('uninstall', 'Uninstall binary, remove config, logs, autostart, and clean up PATH')
    .option('--yes, -y', 'Skip confirmation prompt')
    .action(async (options: { yes?: boolean }) => {
      if (!options.yes) {
        const ok = await confirm({
          message: `This will completely remove ${pc.bold('balatro-saves-sync')} and all its data. Continue?`,
          default: false
        })
        if (!ok) {
          console.log(pc.dim('Uninstall cancelled.'))
          process.exit(0)
        }
      }

      try {
        await uninstallBinary()
      } catch (err) {
        console.error(pc.red(`Uninstall failed: ${err}`))
        process.exit(1)
      }
    })
}
