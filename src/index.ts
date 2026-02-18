import cac from 'cac'
import { APP_VERSION } from '@/utils/constants'
import { registerAutostartCommand } from '@/commands/autostart'
import { registerConfigCommands } from '@/commands/config'
import { registerInstallCommand } from '@/commands/install'
import { registerLogsCommand } from '@/commands/logs'
import { registerSetupCommand } from '@/commands/setup'
import { registerSyncCommands } from '@/commands/sync'
import { registerUpdateCommand } from '@/commands/update'
import { registerWatchCommand } from '@/commands/watch'

const cli = cac('balatro-saves-sync')

// Register all commands
registerWatchCommand(cli)
registerSyncCommands(cli)
registerConfigCommands(cli)
registerSetupCommand(cli)
registerAutostartCommand(cli)
registerLogsCommand(cli)
registerInstallCommand(cli)
registerUpdateCommand(cli)

// Global help & version
cli.help()
cli.version(APP_VERSION)

// Parse and run
cli.parse()
