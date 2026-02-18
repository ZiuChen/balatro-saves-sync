import process from 'node:process'
import type { CAC } from 'cac'
import pc from 'picocolors'
import { getConfigValue, listConfig, setConfigValue } from '@/utils/config'
import { getConfigFilePath } from '@/utils/constants'

export function registerConfigCommands(cli: CAC): void {
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
}
