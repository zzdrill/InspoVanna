# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DreamHub is a local AI creative studio — a Python HTTP server that serves a single-page web frontend for interacting with Volcano Engine (火山引擎) AI services. It supports text chat, image generation, video generation, and video enhancement through the Volcano Engine ARK API.

## Running the Application

```bash
# Install dependencies (auto-handled by startup scripts on first run)
pip install -r requirements.txt

# Start the server (port 8765)
python server.py

# Alternative: use a custom config file
python server.py --config path/to/config.json

# Cross-platform startup scripts (auto-create venv, install deps, launch browser)
run.bat     # Windows
./run.sh    # macOS/Linux
```

The server auto-opens `http://localhost:8765` in the default browser.

There is no test framework, linter, or build step.

## Architecture

### Backend (`server.py`)

A single-file Python server using `http.server` with `ThreadingMixIn` for concurrent request handling. All routing is handled by `DreamHubHandler` via `if-elif` chains in `do_GET` / `do_POST`.

**Key global state:**
- `_config` — loaded from `config.json` at startup, mutable (workspace path can be updated at runtime)
- `tos_client` — Volcano Engine TOS (object storage) client, initialized once
- `_tos_cache` — in-memory SHA-256 keyed cache for deduplicating TOS uploads within `TOS_CACHE_TTL` seconds

**API endpoint categories:**
- `/api/ark/*` — ARK API proxy (file upload, chat/image/video generation)
- `/api/tos/*` — TOS upload and presigned URL generation
- `/api/workspace/*` — Local workspace CRUD (browse, save, rename, move, delete, mkdir, upload, extract-frames)
- `/api/video/*` — Video generation polling and enhancement
- `/api/config` — Get/set configuration
- `/workspace/*` — Static file serving from the workspace directory

**External services:**
- **Volcano Engine ARK API** — text/image/video generation (API key in `volcano.ark_api_key`)
- **Volcano Engine TOS** — object storage for uploading media before sending to ARK (AK/SK auth)
- **Volcano Engine AI MediaKit** — video enhancement/upscaling

### Frontend (`web/dreamhub.html`)

A ~300KB single-file SPA with vanilla JavaScript. No framework, no bundler. Uses Tailwind CSS via CDN.

**Page structure:** Sidebar navigation with 6 sections — Home, Workspace, Text, Image, Video, Settings.

**State management:** A global `state` JavaScript object + localStorage for persistence. No reactive system — state changes trigger manual DOM updates.

**Key patterns:**
- All API calls use `fetch()` to the local server
- Long-running operations (video generation) use polling (`/api/video/status`)
- The `@mention` system in video prompts allows referencing workspace images/videos/audio
- File drag-and-drop is supported for uploads
- Prompts auto-save to workspace metadata files

### Configuration (`config.json`)

Must be created from `config.json.example`. Contains:
- `volcano` — API credentials (ARK key, TOS AK/SK/region/bucket, MediaKit key)
- `models` — default and available model IDs for text/image/video
- `workspace.path` — absolute path to local workspace directory

**`config.json` contains secrets and must never be committed.**

### Workspace

The workspace is a local directory (configured in `config.json`) where generated content is organized into projects. Each project has subfolders: `Text/`, `Image/`, `Video/`, `Audio/`.

## Dependencies

Only two Python packages: `tos` (Volcano Engine TOS client) and `opencv-python` (video frame extraction). The server uses Python's standard library for everything else (HTTP server, threading, JSON, file I/O).

## Key Conventions

- The UI language is Chinese (中文) — all user-facing strings in the frontend are in Chinese
- API responses use `{ "error": "..." }` for errors and `{ "ok": true, ... }` for success
- File path security: all workspace paths are validated against `".."` traversal
- TOS uploads are cached by SHA-256 hash to avoid re-uploading identical files
- Presigned URLs expire after 2 hours (`PRESIGN_EXPIRES = 7200`)
