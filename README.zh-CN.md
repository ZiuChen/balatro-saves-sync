[English](README.md) | [中文](README.zh-CN.md)

----

# Balatro 存档同步工具

一个 CLI 工具，自动在本地与 iCloud 之间同步 [Balatro](https://www.playbalatro.com/) 游戏存档，实现跨设备无缝游玩。

## 功能特性

- **游戏启动/退出自动同步** — 监控 Balatro 进程，游戏启动时自动下载存档，关闭时自动上传
- **手动上传/下载** — 随时通过 CLI 命令手动触发同步
- **自动备份** — 每次上传/下载前，自动在 iCloud 备份目录创建带时间戳的备份，防止存档丢失
- **交互式配置** — 首次使用时配置向导引导你设置所有目录路径
- **跨平台支持** — 支持 macOS、Windows 和 Linux，自动识别平台默认路径
- **持久化日志** — 所有操作记录写入系统日志目录，便于排查问题

## 环境要求

- 系统已启用并可访问 iCloud 云盘
- Balatro 已安装并至少启动过一次（以创建存档目录）

## 安装

### 一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/ZiuChen/balatro-saves-sync/main/install.sh | bash
```

自动下载最新预构建二进制文件，验证 SHA256 校验和，安装到 `~/.local/bin/`。安装后工具会在后台自动更新。

### 安装指定版本

```bash
curl -fsSL https://raw.githubusercontent.com/ZiuChen/balatro-saves-sync/main/install.sh | bash -s 0.2.0
```

### 从源码构建

需要 [Bun](https://bun.sh/) >= 1.0 和 [pnpm](https://pnpm.io/)：

```bash
git clone https://github.com/ZiuChen/balatro-saves-sync.git
cd balatro-saves-sync
pnpm install
pnpm build
./dist/balatro-saves-sync install
```

## 快速开始

```bash
# 运行交互式配置（首次使用）
balatro-saves-sync setup

# 开始监听游戏启动/退出
balatro-saves-sync watch
```

首次运行任何命令时（如尚未配置），会自动提示设置以下项目：

| 配置项         | 说明                    | macOS 默认值                                                          |
| -------------- | ----------------------- | --------------------------------------------------------------------- |
| `saveDir`      | Balatro 本地存档目录    | `~/Library/Application Support/Balatro`                               |
| `cloudSaveDir` | iCloud 云存档目录       | `~/Library/Mobile Documents/com~apple~CloudDocs/Balatro Cloud Save`   |
| `backupDir`    | iCloud 备份目录         | `~/Library/Mobile Documents/com~apple~CloudDocs/Balatro Backup Saves` |
| `pollInterval` | 进程检测间隔（毫秒）   | `3000`                                                                |

## CLI 命令

### `watch` — 监听游戏自动同步

```bash
balatro-saves-sync watch
```

以轮询方式监控 Balatro 进程：

- **游戏启动** → 触发 **DOWNLOAD**（iCloud → 本地）
- **游戏关闭** → 触发 **UPLOAD**（本地 → iCloud）

按 `Ctrl+C` 优雅停止监听。

### `upload` — 手动上传

```bash
balatro-saves-sync upload
```

将本地存档复制到 iCloud 云存档目录。上传前自动备份本地和云端存档。

### `download` — 手动下载

```bash
balatro-saves-sync download
```

将 iCloud 云端存档复制到本地存档目录。下载前自动备份本地和云端存档。

### `config get [key]` — 查看配置

```bash
# 查看所有配置
balatro-saves-sync config get

# 查看指定配置项
balatro-saves-sync config get saveDir
```

### `config set <key> <value>` — 修改配置

```bash
balatro-saves-sync config set saveDir /path/to/saves
balatro-saves-sync config set pollInterval 5000
```

### `setup` — 重新运行配置向导

```bash
balatro-saves-sync setup
```

配置向导还会询问是否将工具注册为系统启动项。

### `autostart` — 管理开机自启

```bash
# 启用开机自启
balatro-saves-sync autostart enable

# 禁用开机自启
balatro-saves-sync autostart disable

# 查看当前状态
balatro-saves-sync autostart status
```

支持 macOS、Windows 和 Linux。基于 [auto-launch](https://github.com/Teamwork/node-auto-launch) 实现。

> **提示：** 运行 `setup` 向导时也会交互式询问是否启用开机自启。

## 目录结构

### 存档与同步

每次上传或下载前，工具会在配置的备份目录下创建带时间戳的备份文件夹：

```
iCloud 云盘/
├── Balatro Cloud Save/        # 共享存档（仅保留最新版本）
│   ├── settings.jkr
│   ├── profile.jkr
│   └── ...
└── Balatro Backup Saves/      # 带时间戳的备份
    ├── local-before-upload_2026-02-17_14-30-00/
    ├── cloud-before-download_2026-02-17_15-00-00/
    └── ...
```

### 配置与日志

| 项目         | 路径                                                    |
| ------------ | ------------------------------------------------------- |
| 配置文件     | `~/.balatro-saves-sync/config.json`                     |
| 日志 (macOS) | `~/Library/Logs/balatro-saves-sync/YYYY-MM-DD.log`      |
| 日志 (Win)   | `%LOCALAPPDATA%/balatro-saves-sync/logs/YYYY-MM-DD.log` |
| 日志 (Linux) | `~/.local/state/balatro-saves-sync/logs/YYYY-MM-DD.log` |

## 开机自启

使用内置的 CLI 命令：

```bash
balatro-saves-sync autostart enable
```

这会自动为当前平台（macOS / Windows / Linux）创建相应的启动配置。你也可以在 `balatro-saves-sync setup` 过程中完成此设置。

禁用：

```bash
balatro-saves-sync autostart disable
```

## 自动更新

通过安装脚本安装的二进制文件会在启动时自动检查更新并在后台下载安装。更新在下次启动时生效。

手动更新：

```bash
balatro-saves-sync update
```

禁用自动更新：

```bash
export DISABLE_AUTOUPDATER=1
```

## 卸载

```bash
# 移除二进制文件和版本数据
rm -f ~/.local/bin/balatro-saves-sync
rm -rf ~/.local/share/balatro-saves-sync

# 移除配置和日志（可选）
rm -rf ~/.balatro-saves-sync
rm -rf ~/Library/Logs/balatro-saves-sync   # macOS
```

## 工作流程

```
┌─────────────┐     游戏启动         ┌──────────┐     备份 + 复制       ┌──────────────┐
│             │ ──────────────────▶   │          │ ──────────────────▶   │              │
│   Balatro   │                       │   CLI    │                       │  iCloud 目录  │
│  （进程）    │     游戏关闭         │  监听器   │     备份 + 复制       │   云存档      │
│             │ ──────────────────▶   │          │ ◀──────────────────   │              │
└─────────────┘                       └──────────┘                       └──────────────┘
                                           │
                                           │  每次同步
                                           ▼
                                    ┌──────────────┐
                                    │  iCloud 目录   │
                                    │   备份存档     │
                                    └──────────────┘
```

## 致谢

- [LocalThunk](https://twitter.com/LocalThunk) — [Balatro](https://www.playbalatro.com/) 的开发者和美术
- 灵感来自 [balatro-save-manager](https://github.com/Azyzraissi/balatro-save-manager) by Azyz

## 许可证

MIT
