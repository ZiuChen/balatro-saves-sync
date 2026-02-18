import process from 'node:process'
import type { CAC } from 'cac'
import { ensureConfig } from '@/utils/config'
import { download, upload } from '@/utils/sync'
import { checkAndNotifyUpdate } from '@/utils/updater'

export function registerSyncCommands(cli: CAC): void {
  cli.command('upload', 'Upload local saves to iCloud').action(async () => {
    checkAndNotifyUpdate().catch(() => {})
    const config = await ensureConfig()
    const success = await upload(config)
    process.exit(success ? 0 : 1)
  })

  cli.command('download', 'Download saves from iCloud to local').action(async () => {
    checkAndNotifyUpdate().catch(() => {})
    const config = await ensureConfig()
    const success = await download(config)
    process.exit(success ? 0 : 1)
  })
}
