import process from 'node:process'
import type { CAC } from 'cac'
import pc from 'picocolors'
import { getLogDir } from '@/utils/constants'

export function registerLogsCommand(cli: CAC): void {
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
}
