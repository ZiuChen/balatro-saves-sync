import type { CAC } from 'cac'
import { installBinary } from '@/utils/installer'

export function registerInstallCommand(cli: CAC): void {
  cli.command('install', 'Install binary to ~/.local/bin and set up PATH').action(async () => {
    await installBinary()
  })
}
