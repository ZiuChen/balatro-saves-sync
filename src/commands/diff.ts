import process from 'node:process'
import type { CAC } from 'cac'
import { select } from '@inquirer/prompts'
import pc from 'picocolors'
import { ensureConfig } from '@/utils/config'
import { diff, download, formatDiff, upload } from '@/utils/sync'
import { checkAndNotifyUpdate } from '@/utils/updater'

export function registerDiffCommand(cli: CAC): void {
  cli.command('diff', 'Compare local saves with cloud saves').action(async () => {
    checkAndNotifyUpdate().catch(() => {})
    const config = await ensureConfig()
    const result = await diff(config)

    console.log()
    console.log(formatDiff(result))
    console.log()

    const hasLocal = result.localExists && result.localFileCount > 0
    const hasCloud = result.cloudExists && result.cloudFileCount > 0

    if (!hasLocal && !hasCloud) {
      console.log(pc.yellow('No saves found on either side. Nothing to sync.'))
      process.exit(0)
    }

    const identical = result.localHash && result.cloudHash && result.localHash === result.cloudHash
    if (identical) {
      console.log(pc.green('Saves are already in sync. No action needed.'))
      process.exit(0)
    }

    type Action = 'download' | 'upload' | 'cancel'

    const action = await select<Action>({
      message: 'What would you like to do?',
      choices: [
        ...(hasCloud ? [{ name: 'Download (iCloud → Local)', value: 'download' as const }] : []),
        ...(hasLocal ? [{ name: 'Upload (Local → iCloud)', value: 'upload' as const }] : []),
        { name: 'Cancel', value: 'cancel' as const }
      ]
    })

    if (action === 'cancel') {
      console.log('Cancelled.')
      process.exit(0)
    }

    console.log()
    const success = action === 'download' ? await download(config) : await upload(config)
    process.exit(success ? 0 : 1)
  })
}
