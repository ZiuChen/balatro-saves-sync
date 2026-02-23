import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import pc from 'picocolors'
import {
  APP_NAME,
  getConfigDir,
  getInstalledBinaryPath,
  getInstallDir,
  getLogDir,
  getPidFilePath
} from '@/utils/constants'
import { disableAutostart, isAutostartEnabled } from '@/utils/autostart'

// ─── Daemon Cleanup ──────────────────────────────────────

/**
 * Stop the daemon watcher if it's running.
 */
function stopDaemonIfRunning(): boolean {
  const pidFile = getPidFilePath()
  if (!existsSync(pidFile)) return false

  const pid = Number.parseInt(readFileSync(pidFile, 'utf-8').trim(), 10)
  if (Number.isNaN(pid)) return false

  try {
    process.kill(pid, 0) // Check if alive
    process.kill(pid, 'SIGTERM')
    try {
      unlinkSync(pidFile)
    } catch {}
    return true
  } catch {
    // Process not running, clean stale PID file
    try {
      unlinkSync(pidFile)
    } catch {}
    return false
  }
}

// ─── Shell Config Cleanup ────────────────────────────────

/**
 * Detect possible shell config files that may contain PATH entries.
 */
function getShellConfigCandidates(): string[] {
  const home = homedir()
  const candidates = [
    join(home, '.zshrc'),
    join(home, '.bashrc'),
    join(home, '.bash_profile'),
    join(home, '.profile'),
    join(home, '.config', 'fish', 'config.fish')
  ]
  return candidates.filter((f) => existsSync(f))
}

/**
 * Detect shell config files that contain PATH entries added by the installer.
 * Returns a list of file paths that the user should manually clean.
 */
async function detectShellConfigsWithPathEntry(): Promise<string[]> {
  const affected: string[] = []
  const marker = `# Added by ${APP_NAME}`

  for (const configFile of getShellConfigCandidates()) {
    const content = await readFile(configFile, 'utf-8')
    if (content.includes(marker)) {
      affected.push(configFile)
    }
  }

  return affected
}

// ─── Directory Removal ───────────────────────────────────

async function removeIfExists(path: string, label: string): Promise<boolean> {
  if (!existsSync(path)) return false
  await rm(path, { recursive: true, force: true })
  console.log(`  ${pc.green('✓')} Removed ${label}: ${path}`)
  return true
}

// ─── Main Uninstall ──────────────────────────────────────

export async function uninstallBinary(): Promise<void> {
  console.log('')
  console.log(`Uninstalling ${APP_NAME}...`)
  console.log('')

  let removedAnything = false

  // 1. Stop daemon watcher
  const daemonStopped = stopDaemonIfRunning()
  if (daemonStopped) {
    console.log(`  ${pc.green('✓')} Stopped background watcher`)
    removedAnything = true
  }

  // 2. Disable autostart
  try {
    if (await isAutostartEnabled()) {
      await disableAutostart()
      console.log(`  ${pc.green('✓')} Disabled auto-start`)
      removedAnything = true
    }
  } catch {
    console.log(`  ${pc.yellow('⚠')} Failed to disable auto-start (may already be disabled)`)
  }

  // 3. Remove installed binary
  const binaryPath = getInstalledBinaryPath()
  if (existsSync(binaryPath)) {
    if (platform() === 'win32') {
      // On Windows, a running executable cannot be deleted directly.
      // Schedule deletion via `cmd /c del` in a detached subprocess.
      const { spawn } = await import('node:child_process')
      const child = spawn(
        'cmd',
        ['/c', 'ping', '127.0.0.1', '-n', '2', '>', 'nul', '&&', 'del', '/f', '/q', binaryPath],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        }
      )
      child.unref()
      console.log(`  ${pc.green('✓')} Scheduled binary removal: ${binaryPath}`)
    } else {
      // On macOS/Linux, unlinking a running binary is safe — the inode
      // stays alive until the process exits, so there is no issue.
      unlinkSync(binaryPath)
      console.log(`  ${pc.green('✓')} Removed binary: ${binaryPath}`)
    }
    removedAnything = true
  }

  // 4. Remove install data directory (~/.local/share/balatro-saves-sync)
  if (await removeIfExists(getInstallDir(), 'install data')) removedAnything = true

  // 5. Remove config directory (~/.balatro-saves-sync)
  if (await removeIfExists(getConfigDir(), 'config')) removedAnything = true

  // 6. Remove log directory
  if (await removeIfExists(getLogDir(), 'logs')) removedAnything = true

  // 7. Detect shell configs with PATH entries and prompt user
  if (platform() !== 'win32') {
    const affected = await detectShellConfigsWithPathEntry()
    if (affected.length > 0) {
      console.log('')
      console.log(
        pc.yellow(
          '  ⚠ The following shell config files still contain PATH entries added by the installer:'
        )
      )
      for (const f of affected) {
        console.log(pc.yellow(`    - ${f}`))
      }
      console.log(
        pc.dim(`    Please remove the lines marked with "# Added by ${APP_NAME}" manually.`)
      )
    }
  }

  console.log('')
  if (removedAnything) {
    console.log(pc.green('✅ Uninstall complete!'))
  } else {
    console.log(pc.yellow('Nothing to uninstall — no installation was found.'))
  }
  console.log('')
}
