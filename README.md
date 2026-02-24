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

- iCloud Drive enabled and accessible on your system
- Balatro installed and launched at least once (to create save directory)

## Installation

### One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/ZiuChen/balatro-saves-sync/main/install.sh | bash
```

This will download the latest prebuilt binary, verify its SHA256 checksum, and install it to `~/.local/bin/`. The binary auto-updates in the background.

### Install a Specific Version

```bash
curl -fsSL https://raw.githubusercontent.com/ZiuChen/balatro-saves-sync/main/install.sh | bash -s 0.2.0
```

### Build from Source

Requires [Bun](https://bun.sh/) >= 1.0:

```bash
git clone https://github.com/ZiuChen/balatro-saves-sync.git
cd balatro-saves-sync
bun install
bun run build
./dist/balatro-saves-sync install
```

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
# Start watching in foreground
balatro-saves-sync watch

# Start watching as a background daemon
balatro-saves-sync watch -d

# Check watcher status
balatro-saves-sync watch status

# Stop the background watcher
balatro-saves-sync watch stop
```

Monitors the Balatro process in a polling loop:

- **Game launches** → triggers **DOWNLOAD** (iCloud → Local)
- **Game closes** → triggers **UPLOAD** (Local → iCloud)

Use `-d` / `--daemon` flag to run in the background. Press `Ctrl+C` to stop foreground watching gracefully.

### `diff` — Compare local and cloud saves

```bash
balatro-saves-sync diff
```

Displays a comparison table of local vs cloud saves, including file count, size, last modified time, and content hash. The newer side is marked with ★ in the header. If saves are identical (same hash), no action is needed. Otherwise, you can interactively choose to download or upload.

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

### `logs` — Open log directory

```bash
balatro-saves-sync logs
```

Opens the log directory in your system's file manager.

### `install` — Install binary to PATH

```bash
balatro-saves-sync install
```

Installs the binary to `~/.local/bin` and sets up PATH. Useful after building from source.

### `uninstall` — Uninstall completely

```bash
# Interactive confirmation
balatro-saves-sync uninstall

# Skip confirmation
balatro-saves-sync uninstall --yes
```

Completely removes the tool and all its data:

- Stops any running background watcher daemon
- Disables system auto-start (LaunchAgent / startup entry)
- Removes the installed binary (`~/.local/bin/balatro-saves-sync`)
- Removes the install data directory (`~/.local/share/balatro-saves-sync`)
- Removes the config directory (`~/.balatro-saves-sync`)
- Removes the log directory
- Detects and reports shell config files containing PATH entries for manual cleanup

### `update` — Check for updates

```bash
balatro-saves-sync update
```

Checks for the latest version and installs it if available.

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

## Updates

Native installations automatically check for updates on startup and install them in the background. Changes take effect the next time the tool is launched.

To update manually:

```bash
balatro-saves-sync update
```

To disable auto-updates, set the environment variable:

```bash
export DISABLE_AUTOUPDATER=1
```

## Uninstall

Use the built-in uninstall command for a clean removal:

```bash
balatro-saves-sync uninstall
```

This will stop any running daemon, disable auto-start, remove the binary, config, logs, and install data. Shell config files with PATH entries will be reported for manual cleanup.

To skip the confirmation prompt:

```bash
balatro-saves-sync uninstall --yes
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
