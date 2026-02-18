import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import pc from 'picocolors'
import { getLogDir } from './constants'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

let logDirReady = false
let currentLogFile: string | null = null

function getTimestamp(): string {
  return new Date().toISOString()
}

function getLocalTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = now.getFullYear()
  const mo = pad(now.getMonth() + 1)
  const d = pad(now.getDate())
  const h = pad(now.getHours())
  const mi = pad(now.getMinutes())
  const s = pad(now.getSeconds())
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const offH = pad(Math.floor(Math.abs(offset) / 60))
  const offM = pad(Math.abs(offset) % 60)
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${offH}:${offM}`
}

function getLogFileName(): string {
  const now = new Date()
  const date = now.toISOString().split('T')[0]
  return `${date}.log`
}

async function ensureLogDir(): Promise<void> {
  if (!logDirReady) {
    await mkdir(getLogDir(), { recursive: true })
    logDirReady = true
  }
}

function formatMessage(level: LogLevel, message: string): string {
  return `[${getLocalTimestamp()}] [${level.toUpperCase().padEnd(5)}] ${message}`
}

async function writeToLogFile(formatted: string): Promise<void> {
  try {
    await ensureLogDir()
    const fileName = getLogFileName()
    const filePath = join(getLogDir(), fileName)
    currentLogFile = filePath
    await appendFile(filePath, `${formatted}\n`, 'utf-8')
  } catch {
    // Silently fail if we can't write to log file
  }
}

function printToConsole(level: LogLevel, message: string): void {
  const timestamp = pc.dim(getTimestamp())
  switch (level) {
    case 'info':
      console.log(`${timestamp} ${pc.blue('INFO')}  ${message}`)
      break
    case 'warn':
      console.warn(`${timestamp} ${pc.yellow('WARN')}  ${message}`)
      break
    case 'error':
      console.error(`${timestamp} ${pc.red('ERROR')} ${message}`)
      break
    case 'debug':
      if (process.env.DEBUG) {
        console.log(`${timestamp} ${pc.gray('DEBUG')} ${message}`)
      }
      break
  }
}

export async function log(level: LogLevel, message: string): Promise<void> {
  const formatted = formatMessage(level, message)
  printToConsole(level, message)
  await writeToLogFile(formatted)
}

export const logger = {
  info: (message: string) => log('info', message),
  warn: (message: string) => log('warn', message),
  error: (message: string) => log('error', message),
  debug: (message: string) => log('debug', message),
  getLogFile: () => currentLogFile,
  getLogDir
}
