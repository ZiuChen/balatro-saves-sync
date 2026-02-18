import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

describe('watcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('getWatcherStatus', () => {
    it('returns initial status with running=false', async () => {
      const { getWatcherStatus } = await import('@/utils/watcher')
      const status = getWatcherStatus()
      expect(status.running).toBe(false)
      expect(status.gameRunning).toBe(false)
      expect(status.startedAt).toBeNull()
    })

    it('returns a copy (not a reference)', async () => {
      const { getWatcherStatus } = await import('@/utils/watcher')
      const a = getWatcherStatus()
      const b = getWatcherStatus()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  describe('startWatcher with injected processChecker', () => {
    it('detects game launch and triggers download', async () => {
      vi.useFakeTimers()

      const mockDownload = vi.fn().mockResolvedValue(true)
      const mockUpload = vi.fn().mockResolvedValue(true)

      vi.doMock('@/utils/sync', () => ({
        download: mockDownload,
        upload: mockUpload
      }))

      const { startWatcher, getWatcherStatus } = await import('@/utils/watcher')

      let isRunning = false
      const processChecker = vi.fn(async () => isRunning)

      const config = {
        saveDir: '/mock/saves',
        cloudSaveDir: '/mock/cloud',
        backupDir: '/mock/backup',
        pollInterval: 1000
      }

      const stop = await startWatcher(config, { processChecker })

      expect(getWatcherStatus().running).toBe(true)

      // Simulate game launch
      isRunning = true
      await vi.advanceTimersByTimeAsync(1000)

      // Stop watcher
      stop()
      vi.useRealTimers()
    })
  })
})
