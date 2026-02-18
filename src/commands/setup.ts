import type { CAC } from 'cac'
import { runSetupWizard } from '@/utils/config'

export function registerSetupCommand(cli: CAC): void {
  cli
    .command('setup', 'Run interactive setup wizard for first-time configuration')
    .action(async () => {
      await runSetupWizard()
    })
}
