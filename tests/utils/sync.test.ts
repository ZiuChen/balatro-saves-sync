import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AppConfig } from '@/utils/config'

// Mock logger to avoid file I/O
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// Mock backup
vi.mock('@/utils/backup', () => ({
  createBackup: vi.fn().mockResolvedValue('/mock/backup/path')
}))

const mockExistsSync = vi.fn()
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args)
}))

const mockReaddir = vi.fn()
const mockMkdir = vi.fn()
const mockCp = vi.fn()
const mockRm = vi.fn()
vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  cp: (...args: unknown[]) => mockCp(...args),
  rm: (...args: unknown[]) => mockRm(...args)
}))

const config: AppConfig = {
  saveDir: '/mock/saves',
  cloudSaveDir: '/mock/cloud',
  backupDir: '/mock/backup',
  pollInterval: 3000
}

describe('sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('download', () => {
    it('returns false if cloud save directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false)

      const { download } = await import('@/utils/sync')
      const result = await download(config)
      expect(result).toBe(false)
    })

    it('returns false if cloud save directory is empty', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue([])

      const { download } = await import('@/utils/sync')
      const result = await download(config)
      expect(result).toBe(false)
    })

    it('returns true on successful download', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir
        .mockResolvedValueOnce(['save1', 'save2']) // cloudEntries check
        .mockResolvedValueOnce(['old1']) // localEntries (clear)
        .mockResolvedValueOnce(['save1', 'save2']) // newEntries after cp
      mockMkdir.mockResolvedValue(undefined)
      mockCp.mockResolvedValue(undefined)
      mockRm.mockResolvedValue(undefined)

      const { download } = await import('@/utils/sync')
      const result = await download(config)
      expect(result).toBe(true)
    })

    it('returns false if cp throws', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir
        .mockResolvedValueOnce(['save1']) // cloudEntries
        .mockResolvedValueOnce([]) // localEntries
      mockMkdir.mockResolvedValue(undefined)
      mockCp.mockRejectedValue(new Error('cp failed'))

      const { download } = await import('@/utils/sync')
      const result = await download(config)
      expect(result).toBe(false)
    })
  })

  describe('upload', () => {
    it('returns false if local save directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false)

      const { upload } = await import('@/utils/sync')
      const result = await upload(config)
      expect(result).toBe(false)
    })

    it('returns false if local save directory is empty', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue([])

      const { upload } = await import('@/utils/sync')
      const result = await upload(config)
      expect(result).toBe(false)
    })

    it('returns true on successful upload', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir
        .mockResolvedValueOnce(['save1']) // localEntries check
        .mockResolvedValueOnce([]) // cloudEntries (clear)
        .mockResolvedValueOnce(['save1']) // newEntries after cp
      mockMkdir.mockResolvedValue(undefined)
      mockCp.mockResolvedValue(undefined)
      mockRm.mockResolvedValue(undefined)

      const { upload } = await import('@/utils/sync')
      const result = await upload(config)
      expect(result).toBe(true)
    })
  })
})
