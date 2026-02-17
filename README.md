[English](README.md) | [中文](README.zh-CN.md)

----

# Balatro Saves Sync

A CLI tool to automatically synchronize [Balatro](https://www.playbalatro.com/) game saves between your local machine and iCloud, enabling seamless cross-device gameplay.

## Features

- **Auto-sync on game launch/exit** — Monitors the Balatro process and automatically downloads saves when the game starts and uploads when it closes
- **Manual upload/download** — Trigger sync manually at any time via CLI commands
- **Automatic backup** — Every upload/download creates a timestamped backup in iCloud before overwriting, preventing accidental save loss
- **Interactive setup** — First-time configuration wizard guides you through setting up all directories
- **Cross-platform** — Supports macOS, Windows, and Linux with platform-specific default paths
- **Persistent logging** — All operations are logged to system log directories for debugging

## Requirements

- [Bun](https://bun.sh/) >= 1.0 (for building)
- iCloud Drive enabled and accessible on your system
- Balatro installed and launched at least once (to create save directory)

## Installation

```bash
# Clone and build
git clone <repo-url>
cd balatro-saves-sync
pnpm install
pnpm build
```

The build produces a standalone binary at `dist/balatro-saves-sync` — no Node.js runtime required to run it.

## Quick Start

```bash
# Run interactive setup (first time)
balatro-saves-sync setup

# Start watching for game launch/exit
balatro-saves-sync watch
```

On first run of any command (if not yet configured), you'll be prompted to set:

| Config Key     | Description                     | Default (macOS)                                                       |
| -------------- | ------------------------------- | --------------------------------------------------------------------- |
| `saveDir`      | Local Balatro save directory    | `~/Library/Application Support/Balatro`                               |
| `cloudSaveDir` | iCloud shared save directory    | `~/Library/Mobile Documents/com~apple~CloudDocs/Balatro Cloud Save`   |
| `backupDir`    | iCloud backup directory         | `~/Library/Mobile Documents/com~apple~CloudDocs/Balatro Backup Saves` |
| `pollInterval` | Process detection interval (ms) | `3000`                                                                |

## CLI Commands

### `watch` — Auto-sync on game events

```bash
balatro-saves-sync watch
```

Monitors the Balatro process in a polling loop:

- **Game launches** → triggers **DOWNLOAD** (iCloud → Local)
- **Game closes** → triggers **UPLOAD** (Local → iCloud)

Press `Ctrl+C` to stop watching gracefully.

### `upload` — Manual upload

```bash
balatro-saves-sync upload
```

Copies local saves to iCloud cloud save directory. Creates backups of both local and cloud saves before overwriting.

### `download` — Manual download

```bash
balatro-saves-sync download
```

Copies iCloud cloud saves to local save directory. Creates backups of both local and cloud saves before overwriting.

### `config get [key]` — View configuration

```bash
# Show all config
balatro-saves-sync config get

# Show specific key
balatro-saves-sync config get saveDir
```

### `config set <key> <value>` — Update configuration

```bash
balatro-saves-sync config set saveDir /path/to/saves
balatro-saves-sync config set pollInterval 5000
```

### `setup` — Re-run setup wizard

```bash
balatro-saves-sync setup
```

The setup wizard will also ask whether to register the tool as a system startup item.

### `autostart` — Manage system startup

```bash
# Enable auto-start on login
balatro-saves-sync autostart enable

# Disable auto-start
balatro-saves-sync autostart disable

# Check current status
balatro-saves-sync autostart status
```

Supports macOS, Windows, and Linux. Powered by [auto-launch](https://github.com/Teamwork/node-auto-launch).

> **Note:** The `setup` wizard also offers to enable autostart interactively.

## Directory Structure

### Saves & Sync

Before each upload or download, the tool creates a timestamped backup folder inside your configured backup directory:

```
iCloud Drive/
├── Balatro Cloud Save/        # Shared save (single latest version)
│   ├── settings.jkr
│   ├── profile.jkr
│   └── ...
└── Balatro Backup Saves/      # Timestamped backups
    ├── local-before-upload_2026-02-17_14-30-00/
    ├── cloud-before-download_2026-02-17_15-00-00/
    └── ...
```

### Config & Logs

| Item         | Location                                                |
| ------------ | ------------------------------------------------------- |
| Config file  | `~/.balatro-saves-sync/config.json`                     |
| Logs (macOS) | `~/Library/Logs/balatro-saves-sync/YYYY-MM-DD.log`      |
| Logs (Win)   | `%LOCALAPPDATA%/balatro-saves-sync/logs/YYYY-MM-DD.log` |
| Logs (Linux) | `~/.local/state/balatro-saves-sync/logs/YYYY-MM-DD.log` |

## Auto-Start on Boot

Use the built-in CLI command:

```bash
balatro-saves-sync autostart enable
```

This will automatically create the appropriate startup configuration for your platform (macOS / Windows / Linux). You can also set this up during `balatro-saves-sync setup`.

To disable:

```bash
balatro-saves-sync autostart disable
```

## How It Works

```
┌─────────────┐     game starts      ┌──────────┐     backup + copy     ┌──────────────┐
│             │ ──────────────────▶   │          │ ──────────────────▶   │              │
│   Balatro   │                       │   CLI    │                       │  iCloud Dir  │
│  (Process)  │     game closes       │  Watcher │     backup + copy     │  Cloud Save  │
│             │ ──────────────────▶   │          │ ◀──────────────────   │              │
└─────────────┘                       └──────────┘                       └──────────────┘
                                           │
                                           │  every sync
                                           ▼
                                    ┌──────────────┐
                                    │  iCloud Dir   │
                                    │ Backup Saves  │
                                    └──────────────┘
```

## Acknowledgments

- [LocalThunk](https://twitter.com/LocalThunk) — Developer and artist of [Balatro](https://www.playbalatro.com/)
- Inspired by [balatro-save-manager](https://github.com/Azyzraissi/balatro-save-manager) by Azyz

## License

MIT
