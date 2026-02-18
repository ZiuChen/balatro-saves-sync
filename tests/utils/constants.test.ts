import { describe, expect, it } from 'vitest'

describe('constants', () => {
  it('exports APP_NAME and APP_VERSION', async () => {
    const { APP_NAME, APP_VERSION } = await import('@/utils/constants')
    expect(APP_NAME).toBe('balatro-saves-sync')
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('exports GitHub constants', async () => {
    const { GITHUB_OWNER, GITHUB_REPO, GITHUB_REPO_URL, GITHUB_API_RELEASES } =
      await import('@/utils/constants')
    expect(GITHUB_OWNER).toBe('ZiuChen')
    expect(GITHUB_REPO).toBe('balatro-saves-sync')
    expect(GITHUB_REPO_URL).toContain('github.com')
    expect(GITHUB_API_RELEASES).toContain('api.github.com')
  })

  it('exports BALATRO_PROCESS_NAMES as non-empty array', async () => {
    const { BALATRO_PROCESS_NAMES } = await import('@/utils/constants')
    expect(BALATRO_PROCESS_NAMES).toBeInstanceOf(Array)
    expect(BALATRO_PROCESS_NAMES.length).toBeGreaterThan(0)
  })

  describe('getBinaryAssetName', () => {
    it('returns correct name for given platform key', async () => {
      const { getBinaryAssetName } = await import('@/utils/constants')
      expect(getBinaryAssetName('darwin-arm64')).toBe('balatro-saves-sync-darwin-arm64')
      expect(getBinaryAssetName('darwin-x64')).toBe('balatro-saves-sync-darwin-x64')
      expect(getBinaryAssetName('linux-x64')).toBe('balatro-saves-sync-linux-x64')
    })

    it('adds .exe extension for win32 platforms', async () => {
      const { getBinaryAssetName } = await import('@/utils/constants')
      expect(getBinaryAssetName('win32-x64')).toBe('balatro-saves-sync-win32-x64.exe')
      expect(getBinaryAssetName('win32-arm64')).toBe('balatro-saves-sync-win32-arm64.exe')
    })
  })

  describe('platform-dependent paths', () => {
    it('getDefaultSaveDir returns a non-empty string', async () => {
      const { getDefaultSaveDir } = await import('@/utils/constants')
      expect(getDefaultSaveDir()).toBeTruthy()
      expect(getDefaultSaveDir()).toContain('Balatro')
    })

    it('getConfigDir returns path with app name', async () => {
      const { getConfigDir } = await import('@/utils/constants')
      expect(getConfigDir()).toContain('.balatro-saves-sync')
    })

    it('getConfigFilePath returns json file path', async () => {
      const { getConfigFilePath } = await import('@/utils/constants')
      expect(getConfigFilePath()).toContain('config.json')
    })

    it('getPidFilePath returns pid file path', async () => {
      const { getPidFilePath } = await import('@/utils/constants')
      expect(getPidFilePath()).toContain('watcher.pid')
    })

    it('getDaemonLogPath returns log file path', async () => {
      const { getDaemonLogPath } = await import('@/utils/constants')
      expect(getDaemonLogPath()).toContain('daemon.log')
    })

    it('getLogDir returns a non-empty string', async () => {
      const { getLogDir } = await import('@/utils/constants')
      expect(getLogDir()).toBeTruthy()
    })
  })
})
