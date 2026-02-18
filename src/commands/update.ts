import process from 'node:process'
import type { CAC } from 'cac'
import pc from 'picocolors'
import { APP_VERSION } from '@/utils/constants'
import { checkForUpdate, performUpdate } from '@/utils/updater'

export function registerUpdateCommand(cli: CAC): void {
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
}
