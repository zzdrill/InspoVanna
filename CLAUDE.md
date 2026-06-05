# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DreamHub is a local AI creative studio — a Python HTTP server that serves a single-page web frontend for interacting with Volcano Engine (火山引擎) AI services. It supports text chat, image generation, video generation, video enhancement, and storyboard-based creative planning through the Volcano Engine ARK API.

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

## File Structure

```
DreamHub/
├── server.py               # Single-file Python backend (2197 lines)
├── config.json             # Secrets & settings (never commit)
├── config.json.example     # Template
├── requirements.txt        # tos, opencv-python
├── run.bat / run.sh        # Cross-platform launchers
├── web/
│   ├── dreamhub.html       # Main SPA (~5379 lines, vanilla JS + Tailwind CDN)
│   ├── storyboard.js       # StoryBoard module (2599 lines, Vue 3 + Vue Flow)
│   ├── sb-dark.css         # StoryBoard stylesheet (2330 lines)
│   ├── sb-test.html        # Vue Flow integration test page
│   └── sb-test2.html       # Vue Flow step-by-step test page
└── resource/
    ├── tips.json           # In-app tip content
    ├── Elephant_logo.png   # App mascot assets
    ├── Sit_elephant.png
    ├── Stand_elephant.png
    ├── Run_elephant.png
    └── Contributor/        # Contributor avatars
```

## Architecture

### Backend (`server.py`)

A single-file Python server using `http.server` with `ThreadingMixIn` for concurrent request handling. All routing is handled by `DreamHubHandler` via `if-elif` chains in `do_GET` / `do_POST`.

**Key global state:**
- `_config` — loaded from `config.json` at startup, mutable (workspace path can be updated at runtime)
- `ARK_API_KEY` / `ARK_BASE` — ARK API credentials and base URL (`https://ark.cn-beijing.volces.com/api/v3`)
- `AMK_API_KEY` — AI MediaKit credentials for video enhancement
- `tos_client` — Volcano Engine TOS (object storage) client, initialized once
- `_tos_cache` — in-memory SHA-256 keyed cache for deduplicating TOS uploads within `TOS_CACHE_TTL` seconds
- `PROJECT_SUBFOLDERS` — `["Text", "Image", "Video", "Audio"]` — standard project layout

**GET endpoints:**
- `/api/config` — return full config JSON
- `/api/workspace/config` — return workspace path
- `/api/workspace/browse-dir` — browse local filesystem for path picker
- `/api/workspace/projects` — list workspace projects
- `/api/workspace/browse` — browse workspace files/folders
- `/api/workspace/read` — read a text file from workspace
- `/api/workspace/prompt` — get saved prompt for a workspace file
- `/api/video/status` — poll video generation task status
- `/api/video/enhance/status` — poll video enhancement task status
- `/api/storyboard` — read storyboard.json for a project
- `/api/contributors` — list contributor entries from `resource/Contributor/`
- `/workspace/*` — static file serving from workspace directory
- `/web/*`, `/resource/*` — static file serving from project directory

**POST endpoints:**
- `/api/config` — import/update config (hot-reload)
- `/api/tos/upload` — upload file to TOS, return presigned URL
- `/api/tos/presign` — regenerate presigned URL for an existing TOS key
- `/api/workspace/config` — set workspace path
- `/api/workspace/projects` — create a new project
- `/api/workspace/mkdir` — create a folder
- `/api/workspace/rename` — rename a file/folder
- `/api/workspace/move` — move a file/folder
- `/api/workspace/delete` — delete a file/folder
- `/api/workspace/save` — download a URL and save to workspace
- `/api/workspace/save-text` — save text content to a workspace file
- `/api/workspace/upload` — upload a file to workspace (multipart)
- `/api/workspace/save-prompt` — persist a prompt metadata file
- `/api/workspace/extract-frames` — extract first/last frame from a video (opencv)
- `/api/video/generate` — create ARK video generation task
- `/api/video/enhance` — start AI MediaKit video enhancement
- `/api/ark/file-upload` — upload file to ARK Files API (for document/video understanding)
- `/api/storyboard/save` — save storyboard.json for a project
- `/api/storyboard/sync-folders` — create/prune Storyboard episode+scene directories
- `/api/script/analyze` — LLM-powered screenplay analysis (split episodes/scenes/shots)
- `/api/ark/chat` — ARK chat completions proxy (used by StoryBoard AI assistant)

**External services:**
- **Volcano Engine ARK API** — text/image/video generation and chat completions
- **Volcano Engine TOS** — object storage for uploading media before sending to ARK (AK/SK auth)
- **Volcano Engine AI MediaKit (AMK)** — video enhancement/upscaling
- **ARK Files API** — file upload for multimodal document/video understanding in text chat

### Frontend (`web/dreamhub.html`)

A ~5379-line single-file SPA with vanilla JavaScript. No framework, no bundler. Uses Tailwind CSS via CDN.

**Page structure:** Sidebar navigation with 7 sections — Home, Workspace, Text, Image, Video, StoryBoard, Settings.

**State management:** A global `state` JavaScript object + localStorage for persistence. No reactive system — state changes trigger manual DOM updates.

**Key patterns:**
- All API calls use `fetch()` to the local server
- Long-running operations (video generation) use polling (`/api/video/status`)
- The `@mention` system in video/storyboard prompts allows referencing workspace images/videos/audio
- File drag-and-drop is supported for uploads
- Prompts auto-save to workspace metadata files
- StoryBoard module is lazy-loaded as a separate ES module (`/web/storyboard.js`) via `window.__loadStoryboard()`

### StoryBoard Module (`web/storyboard.js` + `web/sb-dark.css`)

A separate ES module (~2599 lines) loaded on demand. Built with Vue 3 (via esm.sh CDN) and Vue Flow for the shot canvas.

**Three-level hierarchy:** Episode → Scene → Shot (Vue Flow canvas)

**Four node types on the shot canvas:** text, image, video, audio — each with generate, upload, workspace-pick, and history.

**Key features:**
- AI assistant panel (calls `/api/ark/chat`)
- Screenplay import wizard (calls `/api/script/analyze` to split into episodes/scenes/shots)
- Library panel for characters, props, and scenes (with image generation)
- `@mention` reference system for connecting nodes across levels
- Prompt optimization via ARK API
- Workspace sync (`/api/storyboard/sync-folders`)
- Auto-save with 500ms debounce

**CSS:** `sb-dark.css` is dynamically injected at mount time alongside Vue Flow CDN stylesheets. `dreamhub.html` also contains light-theme overrides for `.sb-root`.

**Mount/unmount:** exported as `{ mount, unmount }` — `dreamhub.html` calls `mount(el, state)` when navigating to the StoryBoard page and caches the module in `window.__storyboardMount`.

### Configuration (`config.json`)

Must be created from `config.json.example`. Contains:
- `volcano` — API credentials: `ark_api_key`, `tos_ak`, `tos_sk`, `tos_region`, `tos_bucket`, `ai_mediakit_api`
- `models` — default and available model IDs for text/image/video (e.g. `text_default`, `video_default`)
- `workspace.path` — absolute path to local workspace directory

**`config.json` contains secrets and must never be committed.**

### Workspace

The workspace is a local directory (configured in `config.json`) where generated content is organized into projects. Each project has standard subfolders: `Text/`, `Image/`, `Video/`, `Audio/`. StoryBoard adds a `Storyboard/` subfolder with `storyboard.json` and episode/scene directories.

## Dependencies

Only two Python packages: `tos` (Volcano Engine TOS client) and `opencv-python` (video frame extraction). The server uses Python's standard library for everything else (HTTP server, threading, JSON, file I/O).

Frontend dependencies are all CDN-loaded: Tailwind CSS, Vue 3, htm, Vue Flow (core, controls, background, minimap).

## Key Conventions

- The UI language is Chinese (中文) — all user-facing strings in the frontend are in Chinese
- API responses use `{ "error": "..." }` for errors and `{ "ok": true, ... }` for success
- File path security: all workspace paths are validated against `".."` traversal
- TOS uploads are cached by SHA-256 hash to avoid re-uploading identical files within `TOS_CACHE_TTL` (7000s)
- Presigned URLs expire after 2 hours (`PRESIGN_EXPIRES = 7200`)
- Video generation uses ARK Content Generation API (`/api/v3/contents/generations/tasks`); text chat uses Chat Completions API (`/api/v3/chat/completions`)
- StoryBoard data is persisted as `storyboard.json` under `<workspace>/<project>/Storyboard/`
