import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import pc from 'picocolors'
import {
  APP_NAME,
  APP_VERSION,
  getBinDir,
  getInstalledBinaryPath,
  getInstallDir
} from './constants'

// ─── Shell Config Detection ─────────────────────────────

/**
 * Detect the user's shell config file for PATH modification.
 */
function detectShellConfig(): string | null {
  const home = homedir()
  const shell = process.env.SHELL || ''

  if (shell.includes('zsh')) {
    return join(home, '.zshrc')
  }
  if (shell.includes('bash')) {
    const bashrc = join(home, '.bashrc')
    const profile = join(home, '.bash_profile')
    if (existsSync(bashrc)) return bashrc
    if (existsSync(profile)) return profile
    return bashrc
  }
  if (shell.includes('fish')) {
    return join(home, '.config', 'fish', 'config.fish')
  }

  // Fallback: try common files
  const candidates = ['.zshrc', '.bashrc', '.bash_profile', '.profile']
  for (const name of candidates) {
    const path = join(home, name)
    if (existsSync(path)) return path
  }

  return null
}

/**
 * Check if ~/.local/bin is already in PATH.
 */
function isBinDirInPath(): boolean {
  const binDir = getBinDir()
  const separator = platform() === 'win32' ? ';' : ':'
  const pathDirs = (process.env.PATH || '').split(separator)
  return pathDirs.some((d) => d === binDir || d === `${homedir()}/.local/bin`)
}

/**
 * Add ~/.local/bin to PATH in the user's shell config.
 */
async function addBinDirToPath(): Promise<string | null> {
  if (isBinDirInPath()) return null

  if (platform() === 'win32') {
    return null // Windows PATH modification requires registry, handled separately
  }

  const configFile = detectShellConfig()
  if (!configFile) {
    console.log(pc.yellow('⚠️  Could not detect shell config file.'))
    console.log(pc.yellow('   Please add ~/.local/bin to your PATH manually.'))
    return null
  }

  const isFish = configFile.includes('fish')
  const exportLine = isFish
    ? `\n# Added by ${APP_NAME}\nset -gx PATH $HOME/.local/bin $PATH\n`
    : `\n# Added by ${APP_NAME}\nexport PATH="$HOME/.local/bin:$PATH"\n`

  let content = ''
  if (existsSync(configFile)) {
    content = await readFile(configFile, 'utf-8')
    // Already added
    if (content.includes(`# Added by ${APP_NAME}`)) {
      return null
    }
  }

  await writeFile(configFile, content + exportLine, 'utf-8')
  return configFile
}

// ─── Install Command ─────────────────────────────────────

/**
 * Install the binary to ~/.local/bin and set up PATH.
 * Called by the bootstrap script (`install.sh`) or manually by users.
 */
export async function installBinary(): Promise<void> {
  const sourcePath = process.execPath
  const targetPath = getInstalledBinaryPath()
  const binDir = getBinDir()
  const installDir = getInstallDir()

  console.log(`\nInstalling ${APP_NAME} v${APP_VERSION}...`)
  console.log('')

  // 1. Create directories
  await mkdir(binDir, { recursive: true })
  await mkdir(installDir, { recursive: true })

  // 2. Copy binary
  if (sourcePath !== targetPath) {
    await copyFile(sourcePath, targetPath)
    if (platform() !== 'win32') {
      await chmod(targetPath, 0o755)
    }
    console.log(`  ${pc.green('✓')} Binary installed to ${targetPath}`)
  } else {
    console.log(`  ${pc.green('✓')} Binary already at ${targetPath}`)
  }

  // 3. Write version file
  await writeFile(join(installDir, 'version'), APP_VERSION, 'utf-8')
  console.log(`  ${pc.green('✓')} Version ${APP_VERSION} recorded`)

  // 4. Ensure PATH
  if (platform() !== 'win32') {
    if (isBinDirInPath()) {
      console.log(`  ${pc.green('✓')} ${binDir} already in PATH`)
    } else {
      const configFile = await addBinDirToPath()
      if (configFile) {
        console.log(`  ${pc.green('✓')} Added ${binDir} to PATH in ${configFile}`)
        console.log(pc.dim(`     Run \`source ${configFile}\` or restart your shell to apply`))
      }
    }
  } else {
    if (!isBinDirInPath()) {
      console.log(pc.yellow(`  ⚠️  Please add ${binDir} to your system PATH manually`))
    } else {
      console.log(`  ${pc.green('✓')} ${binDir} already in PATH`)
    }
  }

  console.log('')
  console.log(pc.green('✅ Installation complete!'))
  console.log('')
  console.log(`Run ${pc.cyan(`${APP_NAME} setup`)} to configure your first sync.`)
  console.log('')
}
