"""
DreamHub - Lightweight Python server.
Provides:
  - Static file serving (HTML, CSS, JS)
  - POST /api/tos/upload  — upload image to TOS, return presigned URL
  - POST /api/tos/presign  — regenerate presigned URL for existing key
  - GET  /workspace/...    — serve files from local workspace directory
  - GET  /api/workspace/config  — get workspace path
  - POST /api/workspace/config  — set workspace path (updates config.json)
  - POST /api/workspace/save    — download URL and save to workspace
"""

import json
import os
import sys
import io
import uuid
import mimetypes
import threading
import webbrowser
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, unquote, parse_qs

try:
    import tos
    from tos import TosClientV2
    from tos.enum import HttpMethodType
except ImportError:
    print("[ERROR] tos package not installed. Run: pip install tos")
    sys.exit(1)

# ---- Configuration ----
PORT = 8765
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
TOS_UPLOAD_PREFIX = "temp/aigc"
PRESIGN_EXPIRES = 7200  # 2 hours


def load_config():
    if not os.path.exists(CONFIG_PATH):
        print(f"[ERROR] config.json not found at {CONFIG_PATH}")
        sys.exit(1)
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_config(config):
    """Save config dict back to config.json."""
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


_config = load_config()
_tos_conf = _config.get("volcano", {})
TOS_AK = _tos_conf.get("tos_ak", "")
TOS_SK = _tos_conf.get("tos_sk", "")
TOS_REGION = _tos_conf.get("tos_region", "cn-shanghai")
TOS_BUCKET = _tos_conf.get("tos_bucket", "")


def get_workspace_path():
    """Return the configured workspace directory path, creating it if needed."""
    path = _config.get("workspace", {}).get("path", "")
    if not path:
        path = os.path.join(BASE_DIR, "workspace")
    path = os.path.normpath(path)
    os.makedirs(path, exist_ok=True)
    return path


PROJECT_SUBFOLDERS = ["Text", "Image", "Video", "Audio"]


def list_projects():
    """List project folders under workspace root, each containing Text/Image/Video."""
    ws = get_workspace_path()
    projects = []
    try:
        for name in sorted(os.listdir(ws)):
            full = os.path.join(ws, name)
            if os.path.isdir(full):
                projects.append({
                    "name": name,
                    "path": full,
                    "hasSubfolders": all(os.path.isdir(os.path.join(full, s)) for s in PROJECT_SUBFOLDERS),
                })
    except Exception:
        pass
    return projects


def create_project(name):
    """Create a project folder with Text/Image/Video subfolders. Returns project info."""
    # Sanitize name
    name = name.strip().replace("/", "").replace("\\", "").replace("..", "")
    if not name:
        raise ValueError("Invalid project name")
    ws = get_workspace_path()
    proj_path = os.path.join(ws, name)
    if os.path.exists(proj_path):
        raise ValueError(f"Project '{name}' already exists")
    for sub in PROJECT_SUBFOLDERS:
        os.makedirs(os.path.join(proj_path, sub), exist_ok=True)
    return {"name": name, "path": proj_path}

tos_client = None
if TOS_AK and TOS_SK:
    _tos_endpoint = f"tos-{TOS_REGION}.volces.com"
    try:
        tos_client = TosClientV2(ak=TOS_AK, sk=TOS_SK, endpoint=_tos_endpoint, region=TOS_REGION)
        print(f"[OK] TOS connected: bucket={TOS_BUCKET}, region={TOS_REGION}")
    except Exception as e:
        print(f"[ERROR] TOS connection failed: {e}")
else:
    print("[WARN] TOS AK/SK not configured in config.json")


# ---- TOS helpers ----
def upload_to_tos(file_data, filename, content_type):
    """Upload file bytes to TOS and return (key, presigned_url)."""
    if not tos_client:
        raise Exception("TOS not configured")

    unique_id = uuid.uuid4().hex[:12]
    key = f"{TOS_UPLOAD_PREFIX}/{unique_id}/{filename}"

    tos_client.put_object(
        bucket=TOS_BUCKET,
        key=key,
        content=io.BytesIO(file_data),
        content_type=content_type,
    )

    url = get_presigned_url(key)
    return key, url


def get_presigned_url(key):
    """Generate a presigned GET URL for the given TOS key."""
    if not tos_client:
        raise Exception("TOS not configured")

    result = tos_client.pre_signed_url(
        http_method=HttpMethodType.Http_Method_Get,
        bucket=TOS_BUCKET,
        key=key,
        expires=PRESIGN_EXPIRES,
    )
    return result.signed_url


# ---- ARK Content Generation API helpers ----
ARK_API_KEY = _config.get("volcano", {}).get("ark_api_key", "")
ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3"

# ---- AMK (AI MediaKit) credentials ----
AMK_API_KEY = _config.get("volcano", {}).get("ai_mediakit_api", "")


def _ark_headers():
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {ARK_API_KEY}",
    }


def ark_video_create(model, content, ratio, duration, resolution="720p", watermark=True, tools=None, generate_audio=None):
    """Create a video generation task via ARK REST API. Returns the raw JSON response."""
    payload = {
        "model": model,
        "content": content,
        "ratio": ratio,
        "duration": duration,
        "watermark": watermark,
    }
    if tools:
        payload["tools"] = tools
    if generate_audio is not None:
        payload["generate_audio"] = generate_audio

    url = f"{ARK_BASE}/contents/generations/tasks"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_ark_headers(), method="POST")

    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ark_video_get_task(task_id):
    """Poll a video generation task status. Returns the raw JSON response."""
    url = f"{ARK_BASE}/contents/generations/tasks/{task_id}"
    req = urllib.request.Request(url, headers=_ark_headers(), method="GET")

    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---- Multipart parser (no cgi dependency, works on Python 3.13+) ----
def parse_multipart(body, boundary):
    """
    Parse multipart/form-data body and return list of dicts.
    Each dict: { name, filename?, content_type, data }
    """
    files = []

    # Build boundary markers
    boundary_bytes = boundary.encode("utf-8")
    delimiter = b"--" + boundary_bytes

    # Split by delimiter
    parts = body.split(delimiter)

    for part in parts:
        stripped = part.strip()
        if not stripped or stripped == b"--" or stripped.startswith(b"--"):
            continue

        sep = b"\r\n\r\n"
        if sep not in part:
            continue

        raw_headers, file_data = part.split(sep, 1)
        if file_data.endswith(b"\r\n"):
            file_data = file_data[:-2]

        headers_str = raw_headers.decode("utf-8", errors="replace").strip()
        filename = None
        field_name = None
        content_type = "application/octet-stream"

        for line in headers_str.split("\r\n"):
            lower = line.lower()
            if "content-disposition" in lower:
                for segment in line.split(";"):
                    seg = segment.strip()
                    if seg.startswith("name="):
                        field_name = seg.split("=", 1)[1].strip('"').strip()
                    elif seg.startswith("filename="):
                        filename = seg.split("=", 1)[1].strip('"').strip()
            elif "content-type" in lower:
                content_type = line.split(":", 1)[1].strip()

        if field_name and file_data:
            entry = {
                "name": field_name,
                "content_type": content_type,
                "data": file_data,
            }
            if filename:
                entry["filename"] = filename
            files.append(entry)

    return files


# ---- HTTP Handler ----
class DreamHubHandler(BaseHTTPRequestHandler):
    """Serves static files and handles TOS API requests."""

    def log_message(self, format, *args):
        print(f"[HTTP] {args[0] if args else format}")

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, message, status=400):
        print(f"[ERROR] {status}: {message}")
        self._send_json({"error": message}, status)

    # ---- Static file serving ----
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        # API: return config from config.json (for auto-load on startup)
        if path == "/api/config":
            try:
                self._send_json(_config)
            except Exception as e:
                self._send_error_json(f"Failed to read config: {str(e)}", 500)
            return

        # API: return workspace path
        if path == "/api/workspace/config":
            self._send_json({"path": get_workspace_path()})
            return

        # API: browse local directories for path picker
        if path == "/api/workspace/browse-dir":
            qs = parse_qs(parsed.query)
            dir_path = qs.get("path", [""])[0]
            try:
                if not dir_path:
                    # List drives on Windows
                    if sys.platform == "win32":
                        import string
                        drives = []
                        for letter in string.ascii_uppercase:
                            drive = f"{letter}:\\"
                            if os.path.exists(drive):
                                drives.append({"name": drive, "path": drive})
                        self._send_json({"dirs": drives, "current": ""})
                    else:
                        self._send_json({"dirs": [{"name": "/", "path": "/"}], "current": "/"})
                else:
                    # Security check
                    norm = os.path.normpath(dir_path)
                    entries = []
                    try:
                        for item in sorted(os.listdir(norm)):
                            full = os.path.join(norm, item)
                            if os.path.isdir(full):
                                entries.append({"name": item, "path": full})
                    except PermissionError:
                        pass
                    parent = os.path.dirname(norm)
                    self._send_json({
                        "dirs": entries,
                        "current": norm,
                        "parent": parent if parent != norm else "",
                    })
            except Exception as e:
                self._send_error_json(str(e), 500)
            return

        # API: list projects
        if path == "/api/workspace/projects":
            self._send_json({"projects": list_projects()})
            return

        # API: list contributor images
        if path == "/api/contributors":
            contrib_dir = os.path.join(BASE_DIR, "resource", "Contributor")
            entries = []
            if os.path.isdir(contrib_dir):
                for f in sorted(os.listdir(contrib_dir)):
                    if os.path.isfile(os.path.join(contrib_dir, f)):
                        name, _ = os.path.splitext(f)
                        entries.append({"name": name, "url": f"/resource/Contributor/{f}"})
            self._send_json({"contributors": entries})
            return

        # API: browse workspace directory
        if path == "/api/workspace/browse":
            self._handle_workspace_browse(parsed.query)
            return

        # API: read text file from workspace
        if path == "/api/workspace/read":
            self._handle_workspace_read(parsed.query)
            return

        # API: poll video generation task status
        if path == "/api/video/status":
            self._handle_video_status(parsed.query)
            return

        # API: poll video enhancement task status
        if path == "/api/video/enhance/status":
            self._handle_video_enhance_status(parsed.query)
            return

        # Serve files from workspace directory
        if path.startswith("/workspace/"):
            self._serve_workspace_file(path)
            return

        # Default route -> serve HTML
        if path == "/" or path == "":
            path = "/web/dreamhub.html"

        # Ignore common browser auto-requests
        if path in ("/favicon.ico", "/robots.txt", "/sitemap.xml"):
            self.send_response(204)
            self.end_headers()
            return

        # Security: prevent directory traversal
        if ".." in path:
            self._send_error_json("Forbidden", 403)
            return

        file_path = os.path.normpath(os.path.join(BASE_DIR, path.lstrip("/")))

        # Ensure the resolved path is still under BASE_DIR
        if not file_path.startswith(os.path.normpath(BASE_DIR)):
            self._send_error_json("Forbidden", 403)
            return

        if not os.path.isfile(file_path):
            self._send_error_json("Not found", 404)
            return

        # Guess content type
        ct, _ = mimetypes.guess_type(file_path)
        if ct is None:
            ct = "application/octet-stream"

        with open(file_path, "rb") as f:
            data = f.read()

        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---- API endpoints ----
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/tos/upload":
            self._handle_tos_upload()
        elif path == "/api/tos/presign":
            self._handle_tos_presign()
        elif path == "/api/workspace/config":
            self._handle_workspace_set_config()
        elif path == "/api/workspace/projects":
            self._handle_create_project()
        elif path == "/api/workspace/mkdir":
            self._handle_workspace_mkdir()
        elif path == "/api/workspace/rename":
            self._handle_workspace_rename()
        elif path == "/api/workspace/move":
            self._handle_workspace_move()
        elif path == "/api/workspace/delete":
            self._handle_workspace_delete()
        elif path == "/api/workspace/save":
            self._handle_workspace_save()
        elif path == "/api/workspace/save-text":
            self._handle_workspace_save_text()
        elif path == "/api/workspace/upload":
            self._handle_workspace_upload()
        elif path == "/api/video/generate":
            self._handle_video_generate()
        elif path == "/api/ark/file-upload":
            self._handle_ark_file_upload()
        elif path == "/api/workspace/extract-frames":
            self._handle_extract_frames()
        elif path == "/api/video/enhance":
            self._handle_video_enhance()
        else:
            self._send_error_json("Not found", 404)

    # ---- Workspace helpers ----
    def _handle_workspace_browse(self, query_string):
        """List folders and files under a workspace subdirectory."""
        from urllib.parse import parse_qs
        params = parse_qs(query_string)
        rel_path = params.get("path", [""])[0].strip("/")

        # Security
        if ".." in rel_path:
            self._send_error_json("Forbidden", 403)
            return

        ws_path = get_workspace_path()
        target = os.path.normpath(os.path.join(ws_path, rel_path)) if rel_path else ws_path

        if not target.startswith(ws_path):
            self._send_error_json("Forbidden", 403)
            return

        if not os.path.isdir(target):
            self._send_json({"folders": [], "files": []})
            return

        folders = []
        files = []
        try:
            for name in sorted(os.listdir(target)):
                full = os.path.join(target, name)
                if os.path.isdir(full):
                    folders.append({"name": name})
                elif os.path.isfile(full):
                    size = os.path.getsize(full)
                    ct, _ = mimetypes.guess_type(full)
                    files.append({
                        "name": name,
                        "size": size,
                        "type": ct or "application/octet-stream",
                        "modified": os.path.getmtime(full),
                    })
        except Exception:
            pass

        self._send_json({"folders": folders, "files": files})

    def _handle_workspace_read(self, query_string):
        """Read and return a text file's content from workspace."""
        from urllib.parse import parse_qs, unquote as unq
        params = parse_qs(query_string)
        rel_path = unq(params.get("path", [""])[0].strip("/"))

        if ".." in rel_path:
            self._send_error_json("Forbidden", 403)
            return

        ws_path = get_workspace_path()
        file_path = os.path.normpath(os.path.join(ws_path, rel_path))
        if not file_path.startswith(ws_path):
            self._send_error_json("Forbidden", 403)
            return
        if not os.path.isfile(file_path):
            self._send_error_json("File not found", 404)
            return

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            self._send_json({"name": os.path.basename(file_path), "content": content})
        except Exception as e:
            self._send_error_json(f"Read failed: {str(e)}", 500)

    def _serve_workspace_file(self, url_path):
        """Serve a file from the workspace directory, with Range request support."""
        ws_path = get_workspace_path()
        rel_path = url_path[len("/workspace/"):]
        # Decode URL-encoded characters (e.g. Chinese filenames)
        from urllib.parse import unquote as unq
        rel_path = unq(rel_path)
        # Security: prevent directory traversal
        if ".." in rel_path:
            self._send_error_json("Forbidden", 403)
            return
        file_path = os.path.normpath(os.path.join(ws_path, rel_path))
        if not file_path.startswith(ws_path):
            self._send_error_json("Forbidden", 403)
            return
        if not os.path.isfile(file_path):
            self._send_error_json("Not found", 404)
            return

        ct, _ = mimetypes.guess_type(file_path)
        if ct is None:
            ct = "application/octet-stream"

        file_size = os.path.getsize(file_path)

        # Check for Range header (needed for video playback / preload)
        range_header = self.headers.get("Range")
        if range_header:
            # Parse "bytes=start-end"
            range_spec = range_header.replace("bytes=", "")
            parts = range_spec.split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
            end = min(end, file_size - 1)
            length = end - start + 1

            with open(file_path, "rb") as f:
                f.seek(start)
                data = f.read(length)

            self.send_response(206)
            self.send_header("Content-Type", ct)
            self.send_header("Content-Length", str(length))
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
        else:
            with open(file_path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ct)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)

    def _handle_workspace_set_config(self):
        """Set workspace path and update config.json."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        new_path = data.get("path", "").strip()
        if not new_path:
            self._send_error_json("Missing 'path'")
            return

        # Validate and create directory
        try:
            new_path = os.path.normpath(new_path)
            os.makedirs(new_path, exist_ok=True)
            # Test write permission
            test_file = os.path.join(new_path, ".dreamhub_test")
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
        except Exception as e:
            self._send_error_json(f"Invalid path or no write permission: {str(e)}", 400)
            return

        # Update config.json
        global _config
        _config.setdefault("workspace", {})["path"] = new_path
        try:
            save_config(_config)
            print(f"[OK] Workspace path updated: {new_path}")
            self._send_json({"path": new_path})
        except Exception as e:
            self._send_error_json(f"Failed to save config: {str(e)}", 500)

    def _handle_create_project(self):
        """Create a new project folder with Text/Image/Video subfolders."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        name = data.get("name", "").strip()
        if not name:
            self._send_error_json("Missing 'name'")
            return

        try:
            project = create_project(name)
            print(f"[OK] Project created: {project['name']}")
            self._send_json(project)
        except ValueError as e:
            self._send_error_json(str(e), 400)
        except Exception as e:
            self._send_error_json(f"Failed to create project: {str(e)}", 500)

    def _handle_workspace_mkdir(self):
        """Create a subdirectory in the workspace."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        rel_path = data.get("path", "").strip("/")
        if not rel_path or ".." in rel_path:
            self._send_error_json("Invalid path")
            return

        ws_path = get_workspace_path()
        full_path = os.path.normpath(os.path.join(ws_path, rel_path))
        if not full_path.startswith(ws_path):
            self._send_error_json("Forbidden", 403)
            return

        try:
            os.makedirs(full_path, exist_ok=True)
            print(f"[OK] Directory created: {full_path}")
            self._send_json({"path": full_path})
        except Exception as e:
            self._send_error_json(f"Failed to create directory: {str(e)}", 500)

    def _handle_workspace_rename(self):
        """Rename a file or folder in the workspace."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        old_path = data.get("path", "").strip("/")
        new_name = data.get("newName", "").strip()
        if not old_path or not new_name or ".." in old_path or ".." in new_name:
            self._send_error_json("Invalid parameters")
            return
        new_name = os.path.basename(new_name)

        ws_path = get_workspace_path()
        full_old = os.path.normpath(os.path.join(ws_path, old_path))
        if not full_old.startswith(ws_path) or not os.path.exists(full_old):
            self._send_error_json("Not found", 404)
            return

        full_new = os.path.normpath(os.path.join(os.path.dirname(full_old), new_name))
        if not full_new.startswith(ws_path):
            self._send_error_json("Forbidden", 403)
            return

        if os.path.exists(full_new):
            self._send_error_json(f"'{new_name}' already exists", 400)
            return

        try:
            os.rename(full_old, full_new)
            print(f"[OK] Renamed: {full_old} -> {full_new}")
            self._send_json({"path": full_new})
        except Exception as e:
            self._send_error_json(f"Rename failed: {str(e)}", 500)

    def _handle_workspace_move(self):
        """Move a file or folder into a different directory."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        source = data.get("source", "").strip("/")
        dest_dir = data.get("destDir", "").strip("/")

        if not source or not dest_dir or ".." in source or ".." in dest_dir:
            self._send_error_json("Invalid parameters")
            return

        ws_path = get_workspace_path()
        full_source = os.path.normpath(os.path.join(ws_path, source))
        full_dest_dir = os.path.normpath(os.path.join(ws_path, dest_dir))

        if not full_source.startswith(ws_path) or not os.path.exists(full_source):
            self._send_error_json("Source not found", 404)
            return
        if not full_dest_dir.startswith(ws_path) or not os.path.isdir(full_dest_dir):
            self._send_error_json("Destination folder not found", 404)
            return

        # Prevent moving into itself or a subdirectory of itself
        if full_dest_dir == full_source or full_dest_dir.startswith(full_source + os.sep):
            self._send_error_json("Cannot move item into itself", 400)
            return

        item_name = os.path.basename(full_source)
        full_new = os.path.normpath(os.path.join(full_dest_dir, item_name))

        if os.path.exists(full_new):
            self._send_error_json(f"'{item_name}' already exists in destination", 400)
            return

        try:
            os.rename(full_source, full_new)
            print(f"[OK] Moved: {full_source} -> {full_new}")
            self._send_json({"path": full_new})
        except Exception as e:
            self._send_error_json(f"Move failed: {str(e)}", 500)

    def _handle_workspace_delete(self):
        """Delete a file or empty folder in the workspace."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        rel_path = data.get("path", "").strip("/")
        force = data.get("force", False)
        if not rel_path or ".." in rel_path:
            self._send_error_json("Invalid path")
            return

        ws_path = get_workspace_path()
        full_path = os.path.normpath(os.path.join(ws_path, rel_path))
        if not full_path.startswith(ws_path) or not os.path.exists(full_path):
            self._send_error_json("Not found", 404)
            return

        try:
            if os.path.isdir(full_path):
                if not force and os.listdir(full_path):
                    self._send_error_json("Folder is not empty", 400)
                    return
                import shutil
                shutil.rmtree(full_path)
            else:
                os.remove(full_path)
            print(f"[OK] Deleted: {full_path}")
            self._send_json({"deleted": rel_path})
        except Exception as e:
            self._send_error_json(f"Delete failed: {str(e)}", 500)

    def _handle_workspace_save(self):
        """Download a file from URL and save to workspace directory."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        url = data.get("url", "")
        filename = data.get("filename", f"{uuid.uuid4().hex[:12]}.png")
        subdir = data.get("subdir", "images")

        if not url:
            self._send_error_json("Missing 'url'")
            return

        # Security: sanitize filename
        filename = os.path.basename(filename)
        subdir = subdir.replace("..", "").strip("/")

        ws_path = get_workspace_path()
        save_dir = os.path.join(ws_path, subdir)
        os.makedirs(save_dir, exist_ok=True)

        full_path = os.path.join(save_dir, filename)

        try:
            # Download from URL
            print(f"[INFO] Downloading: {url[:80]}...")
            req = urllib.request.Request(url, headers={"User-Agent": "DreamHub/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                file_data = resp.read()

            with open(full_path, "wb") as f:
                f.write(file_data)

            serve_url = f"/workspace/{subdir}/{filename}"
            print(f"[OK] Saved to workspace: {full_path} ({len(file_data)} bytes)")
            self._send_json({"localPath": full_path, "serveUrl": serve_url})
        except Exception as e:
            print(f"[ERROR] Workspace save failed: {e}")
            import traceback
            traceback.print_exc()
            self._send_error_json(f"Save failed: {str(e)}", 500)

    def _handle_workspace_save_text(self):
        """Save text content directly to workspace directory."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        content = data.get("content", "")
        filename = data.get("filename", "untitled.txt")
        subdir = data.get("subdir", "Text")

        # Security: sanitize
        filename = os.path.basename(filename).replace("..", "")
        subdir = subdir.replace("..", "").strip("/")

        ws_path = get_workspace_path()
        save_dir = os.path.join(ws_path, subdir)
        os.makedirs(save_dir, exist_ok=True)

        full_path = os.path.join(save_dir, filename)

        try:
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)

            serve_url = f"/workspace/{subdir}/{filename}"
            print(f"[OK] Saved text to workspace: {full_path} ({len(content)} chars)")
            self._send_json({"localPath": full_path, "serveUrl": serve_url})
        except Exception as e:
            print(f"[ERROR] Text save failed: {e}")
            self._send_error_json(f"Save failed: {str(e)}", 500)

    def _handle_workspace_upload(self):
        """Upload files directly to workspace via multipart form."""
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            self._send_error_json("Expected multipart/form-data")
            return

        try:
            boundary = ctype.split("boundary=")[1].strip()
            if boundary.startswith('"') and boundary.endswith('"'):
                boundary = boundary[1:-1]
        except (IndexError, AttributeError):
            self._send_error_json("Invalid multipart boundary")
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""
        if not body:
            self._send_error_json("Empty body")
            return

        parts = parse_multipart(body, boundary)
        if not parts:
            self._send_error_json("No file found")
            return

        # Extract project/subdir from text parts
        project = ""
        subdir = ""
        for p in parts:
            if p.get("name") == "project":
                project = p["data"].decode("utf-8", errors="replace")
            elif p.get("name") == "subdir":
                subdir = p["data"].decode("utf-8", errors="replace")

        if not project:
            self._send_error_json("Missing project")
            return

        file_info = None
        for p in parts:
            if p.get("filename"):
                file_info = p
                break
        if not file_info:
            self._send_error_json("No file found")
            return

        filename = os.path.basename(file_info["filename"]).replace("..", "")
        subdir = subdir.replace("..", "").strip("/")
        rel = os.path.join(project, subdir) if subdir else project

        ws_path = get_workspace_path()
        save_dir = os.path.join(ws_path, rel)
        os.makedirs(save_dir, exist_ok=True)

        full_path = os.path.join(save_dir, filename)
        with open(full_path, "wb") as f:
            f.write(file_info["data"])

        serve_url = f"/workspace/{rel}/{filename}".replace("\\", "/")
        print(f"[OK] Uploaded to workspace: {full_path}")
        self._send_json({"localPath": full_path, "serveUrl": serve_url})

    def _handle_tos_upload(self):
        """Handle multipart file upload to TOS."""
        content_type = self.headers.get("Content-Type", "")
        print(f"[INFO] Upload request, Content-Type: {content_type[:80]}")

        if "multipart/form-data" not in content_type:
            self._send_error_json("Expected multipart/form-data")
            return

        # Extract boundary
        try:
            boundary = content_type.split("boundary=")[1].strip()
            # Remove optional quotes around boundary
            if boundary.startswith('"') and boundary.endswith('"'):
                boundary = boundary[1:-1]
        except (IndexError, AttributeError):
            self._send_error_json("Invalid multipart boundary")
            return

        # Read body
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        if not body:
            self._send_error_json("Empty body")
            return

        # Parse multipart
        files = parse_multipart(body, boundary)

        # Upload the first file part
        file_info = next((f for f in files if "filename" in f), None)
        if not file_info:
            self._send_error_json("No file found in upload")
            return
        print(f"[INFO] Uploading: {file_info['filename']}, size={len(file_info['data'])}, type={file_info['content_type']}")

        try:
            key, url = upload_to_tos(
                file_info["data"],
                file_info["filename"],
                file_info["content_type"],
            )
            print(f"[OK] Uploaded: key={key}")
            self._send_json({"url": url, "key": key})
        except Exception as e:
            print(f"[ERROR] TOS upload failed: {e}")
            import traceback
            traceback.print_exc()
            self._send_error_json(f"Upload failed: {str(e)}", 500)

    def _handle_tos_presign(self):
        """Regenerate presigned URL for an existing TOS key."""
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        key = data.get("key", "")
        if not key:
            self._send_error_json("Missing 'key'")
            return

        try:
            url = get_presigned_url(key)
            self._send_json({"url": url, "key": key})
        except Exception as e:
            print(f"[ERROR] Presign failed: {e}")
            self._send_error_json(f"Presign failed: {str(e)}", 500)

    # ---- Video generation ----
    def _handle_video_generate(self):
        """Create a video generation task via ARK Content Generation API.

        Expected JSON body:
        {
            "model": "doubao-seedance-2-0-260128",
            "prompt": "...",
            "ratio": "16:9",
            "duration": 5,
            "watermark": true,
            "images": [ { "url": "data:image/...", "role": "first_frame" }, ... ],
            "videos": [ { "url": "data:video/...", "role": "reference_video" }, ... ]
        }
        """
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        model = data.get("model", "")
        prompt = data.get("prompt", "")
        ratio = data.get("ratio", "16:9")
        duration = data.get("duration", 5)
        watermark = data.get("watermark", True)
        images = data.get("images", [])
        videos = data.get("videos", [])
        audios = data.get("audio", [])
        tools = data.get("tools")
        generate_audio = data.get("generate_audio")

        if not model:
            self._send_error_json("Missing 'model'")
            return
        if not prompt and not images and not videos:
            self._send_error_json("Missing prompt and no reference media")
            return
        if not ARK_API_KEY:
            self._send_error_json("ARK API Key not configured", 400)
            return

        # Build content array for the API
        content = []

        # Add text prompt
        if prompt:
            content.append({"type": "text", "text": prompt})

        def _upload_ref_url(url, default_ct="image/png"):
            """Upload a reference URL to TOS. Handles data: and /workspace/ URLs."""
            if url.startswith("data:"):
                header, b64data = url.split(",", 1)
                ct = header.split(":")[1].split(";")[0] if ":" in header else default_ct
                import base64
                file_data = base64.b64decode(b64data)
            elif url.startswith("/workspace/"):
                from urllib.parse import unquote as unq
                rel = unq(url[len("/workspace/"):])
                ws_path = get_workspace_path()
                local_file = os.path.normpath(os.path.join(ws_path, rel))
                if not local_file.startswith(ws_path) or not os.path.isfile(local_file):
                    raise FileNotFoundError(f"Workspace file not found: {local_file}")
                ct, _ = mimetypes.guess_type(local_file)
                if ct is None:
                    ct = default_ct
                with open(local_file, "rb") as f:
                    file_data = f.read()
            else:
                return url  # already a public URL
            ext = ct.split("/")[-1] if "/" in ct else default_ct.split("/")[-1]
            filename = f"ref_{uuid.uuid4().hex[:8]}.{ext}"
            key, tos_url = upload_to_tos(file_data, filename, ct)
            print(f"[OK] Uploaded ref to TOS: {key}")
            return tos_url

        # Upload images to TOS and add image_url entries
        for img in images:
            url = img.get("url", "")
            role = img.get("role", "reference_image")
            if not url:
                continue

            try:
                url = _upload_ref_url(url, "image/png")
            except Exception as e:
                print(f"[WARN] Failed to upload image ref: {e}")
                continue

            content.append({
                "type": "image_url",
                "image_url": {"url": url},
                "role": role,
            })

        # Upload videos to TOS and add video_url entries
        for vid in videos:
            url = vid.get("url", "")
            role = vid.get("role", "reference_video")
            if not url:
                continue

            try:
                url = _upload_ref_url(url, "video/mp4")
            except Exception as e:
                print(f"[WARN] Failed to upload video ref: {e}")
                continue

            content.append({
                "type": "video_url",
                "video_url": {"url": url},
                "role": role,
            })

        # Upload audios to TOS and add audio_url entries
        for aud in audios:
            url = aud.get("url", "")
            role = aud.get("role", "reference_audio")
            if not url:
                continue

            try:
                url = _upload_ref_url(url, "audio/mpeg")
            except Exception as e:
                print(f"[WARN] Failed to upload audio ref: {e}")
                continue

            content.append({
                "type": "audio_url",
                "audio_url": {"url": url},
                "role": role,
            })

        try:
            result = ark_video_create(model, content, ratio, duration, watermark=watermark, tools=tools, generate_audio=generate_audio)
            print(f"[OK] Video task created: id={result.get('id')}, status={result.get('status')}")
            self._send_json(result)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            print(f"[ERROR] ARK API error: {e.code} {error_body}")
            self._send_error_json(f"ARK API error ({e.code}): {error_body}", 502)
        except Exception as e:
            print(f"[ERROR] Video generation failed: {e}")
            import traceback
            traceback.print_exc()
            self._send_error_json(f"Video generation failed: {str(e)}", 500)

    def _handle_video_status(self, query_string):
        """Poll video generation task status.

        Query params: ?task_id=xxx
        """
        from urllib.parse import parse_qs
        params = parse_qs(query_string)
        task_id = params.get("task_id", [""])[0]

        if not task_id:
            self._send_error_json("Missing 'task_id'")
            return

        if not ARK_API_KEY:
            self._send_error_json("ARK API Key not configured", 400)
            return

        try:
            result = ark_video_get_task(task_id)
            self._send_json(result)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            self._send_error_json(f"ARK API error ({e.code}): {error_body}", 502)
        except Exception as e:
            self._send_error_json(f"Status check failed: {str(e)}", 500)

    def _handle_ark_file_upload(self):
        """Upload a file to ARK Files API for document/video understanding.

        Receives multipart form data with a file, uploads to ARK,
        waits for processing, and returns {id, status, ...}.
        """
        if not ARK_API_KEY:
            self._send_error_json("ARK API Key not configured", 400)
            return

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_error_json("Expected multipart/form-data", 400)
            return

        # Parse multipart
        boundary = content_type.split("boundary=")[-1].encode()
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        parts = body.split(b"--" + boundary)

        file_data = None
        file_name = "upload"
        file_ct = "application/octet-stream"
        preprocess_configs = None

        for part in parts:
            header_end = part.find(b"\r\n\r\n")
            if header_end < 0:
                continue
            header = part[:header_end].decode("utf-8", errors="replace")
            value = part[header_end + 4:]
            if value.endswith(b"\r\n"):
                value = value[:-2]

            if b"filename=" in part:
                file_data = value
                for seg in header.split(";"):
                    seg = seg.strip()
                    if seg.startswith("filename="):
                        file_name = seg.split("=", 1)[1].strip('" ')
                for line in header.split("\r\n"):
                    if line.lower().startswith("content-type:"):
                        file_ct = line.split(":", 1)[1].strip()
            elif b'name="preprocess_configs"' in part:
                try:
                    preprocess_configs = json.loads(value.decode("utf-8"))
                except Exception:
                    pass

        if not file_data:
            self._send_error_json("No file found in request", 400)
            return

        # Build multipart body for ARK
        import uuid as _uuid
        ark_boundary = f"----ArkFormBoundary{_uuid.uuid4().hex[:16]}"
        form_parts = []
        form_parts.append(f'Content-Disposition: form-data; name="purpose"\r\n\r\nuser_data')
        form_parts.append(f'Content-Disposition: form-data; name="file"; filename="{file_name}"\r\nContent-Type: {file_ct}\r\n\r\n')

        form_body = b""
        for p in form_parts[:-1]:
            form_body += f"--{ark_boundary}\r\n{p}\r\n".encode("utf-8")
        # Last part includes the binary file data
        form_body += f"--{ark_boundary}\r\n".encode("utf-8") + form_parts[-1].encode("utf-8") + file_data + f"\r\n--{ark_boundary}--\r\n".encode("utf-8")

        upload_url = f"{ARK_BASE}/files"
        req = urllib.request.Request(
            upload_url,
            data=form_body,
            headers={
                "Authorization": f"Bearer {ARK_API_KEY}",
                "Content-Type": f"multipart/form-data; boundary={ark_boundary}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            file_id = result.get("id")
            print(f"[OK] ARK file uploaded: id={file_id}, name={file_name}")

            # Poll for processing completion (max 120s)
            if file_id:
                import time
                for _ in range(60):
                    poll_url = f"{ARK_BASE}/files/{file_id}"
                    poll_req = urllib.request.Request(poll_url, headers={"Authorization": f"Bearer {ARK_API_KEY}"})
                    try:
                        with urllib.request.urlopen(poll_req, timeout=30) as poll_resp:
                            poll_data = json.loads(poll_resp.read().decode("utf-8"))
                        status = poll_data.get("status", "")
                        if status == "processed":
                            result["status"] = "processed"
                            break
                        elif status == "failed":
                            result["status"] = "failed"
                            break
                    except Exception:
                        pass
                    time.sleep(2)

            self._send_json(result)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            print(f"[ERROR] ARK file upload failed: {e.code} {error_body}")
            self._send_error_json(f"ARK file upload error ({e.code}): {error_body}", 502)
        except Exception as e:
            self._send_error_json(f"File upload failed: {str(e)}", 500)

    # ---- Video enhancement (AMK) ----
    def _handle_video_enhance(self):
        """Submit a video enhancement task via AMK API.

        Expected JSON body:
        {
            "video_url": "/workspace/... or data:... or https://...",
            "tool_version": "standard" | "professional",
            "scene": "common" | "ugc" | "short_series" | "aigc" | "old_film",
            "resolution": "720p" | "1080p" | "2k" | "4k",
            "fps": 30  (optional)
        }
        """
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            self._send_error_json("Invalid JSON")
            return

        video_url = data.get("video_url", "")
        if not video_url:
            self._send_error_json("Missing video_url")
            return

        if not AMK_API_KEY:
            self._send_error_json("AMK API Key not configured", 400)
            return

        # If workspace path or data URL, upload to TOS for public URL
        if video_url.startswith("/workspace/"):
            try:
                from urllib.parse import unquote as unq
                rel = unq(video_url[len("/workspace/"):])
                ws_path = get_workspace_path()
                local_file = os.path.normpath(os.path.join(ws_path, rel))
                if not local_file.startswith(ws_path) or not os.path.isfile(local_file):
                    self._send_error_json("Workspace file not found", 404)
                    return
                ct, _ = mimetypes.guess_type(local_file)
                if ct is None:
                    ct = "video/mp4"
                with open(local_file, "rb") as f:
                    file_data = f.read()
                ext = ct.split("/")[-1] if "/" in ct else "mp4"
                filename = f"enhance_{uuid.uuid4().hex[:8]}.{ext}"
                key, tos_url = upload_to_tos(file_data, filename, ct)
                print(f"[OK] Uploaded enhance video to TOS: {key}")
                video_url = tos_url
            except Exception as e:
                self._send_error_json(f"Upload to TOS failed: {str(e)}", 500)
                return
        elif video_url.startswith("data:"):
            try:
                import base64
                header, b64data = video_url.split(",", 1)
                ct = header.split(":")[1].split(";")[0] if ":" in header else "video/mp4"
                file_data = base64.b64decode(b64data)
                ext = ct.split("/")[-1] if "/" in ct else "mp4"
                filename = f"enhance_{uuid.uuid4().hex[:8]}.{ext}"
                key, tos_url = upload_to_tos(file_data, filename, ct)
                print(f"[OK] Uploaded enhance video (data) to TOS: {key}")
                video_url = tos_url
            except Exception as e:
                self._send_error_json(f"Upload to TOS failed: {str(e)}", 500)
                return

        # Build AMK API request
        payload = {
            "video_url": video_url,
            "tool_version": data.get("tool_version", "standard"),
            "scene": data.get("scene", "aigc"),
            "resolution": data.get("resolution", "1080p"),
        }
        if data.get("fps"):
            payload["fps"] = data["fps"]

        try:
            body_str = json.dumps(payload, ensure_ascii=False)

            req = urllib.request.Request(
                "https://amk.cn-beijing.volces.com/api/v1/tools/enhance-video",
                data=body_str.encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {AMK_API_KEY}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            print(f"[OK] Video enhance task submitted: task_id={result.get('task_id')}")
            self._send_json(result)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            print(f"[ERROR] AMK API error: {e.code} {error_body}")
            self._send_error_json(f"AMK API error ({e.code}): {error_body}", 502)
        except Exception as e:
            print(f"[ERROR] Video enhance submit failed: {e}")
            import traceback
            traceback.print_exc()
            self._send_error_json(f"Video enhance failed: {str(e)}", 500)

    def _handle_video_enhance_status(self, query_string):
        """Poll video enhancement task status via AMK API."""
        from urllib.parse import parse_qs
        params = parse_qs(query_string)
        task_id = params.get("task_id", [""])[0]

        if not task_id:
            self._send_error_json("Missing task_id")
            return

        if not AMK_API_KEY:
            self._send_error_json("AMK API Key not configured", 400)
            return

        try:
            req = urllib.request.Request(
                f"https://amk.cn-beijing.volces.com/api/v1/tasks/{task_id}",
                headers={
                    "Authorization": f"Bearer {AMK_API_KEY}",
                },
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            self._send_json(result)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            self._send_error_json(f"AMK API error ({e.code}): {error_body}", 502)
        except Exception as e:
            self._send_error_json(f"Status check failed: {str(e)}", 500)

    def _handle_extract_frames(self):
        """Extract first and last frames from a workspace video file.

        Receives JSON: { "videoPath": "relative/path/video.mp4" }
        Saves First+<name>.png and Last+<name>.png to the Image folder.
        """
        try:
            import cv2
        except ImportError:
            self._send_error_json("opencv-python 未安装，请运行: pip install opencv-python", 400)
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length > 0 else b""

            try:
                data = json.loads(body)
            except (json.JSONDecodeError, TypeError):
                self._send_error_json("Invalid JSON")
                return
            video_rel = data.get("videoPath", "")
            if not video_rel:
                self._send_error_json("Missing videoPath", 400)
                return

            ws_path = get_workspace_path()
            video_file = os.path.normpath(os.path.join(ws_path, video_rel))
            if not video_file.startswith(ws_path) or not os.path.isfile(video_file):
                self._send_error_json("Video file not found", 404)
                return

            # Determine output directory: Image folder (same project level as video)
            parts = video_rel.replace("\\", "/").split("/")
            parent_parts = parts[:-1]  # e.g. ["project", "Video"]
            if parent_parts:
                parent_parts[-1] = "Image"
                image_dir = os.path.normpath(os.path.join(ws_path, *parent_parts))
            else:
                image_dir = os.path.join(ws_path, "Image")
            os.makedirs(image_dir, exist_ok=True)

            video_name = os.path.splitext(parts[-1])[0]
            first_path = os.path.join(image_dir, f"First+{video_name}.png")
            last_path = os.path.join(image_dir, f"Last+{video_name}.png")

            results = {"first": None, "last": None}

            cap = cv2.VideoCapture(video_file)
            if not cap.isOpened():
                self._send_error_json("无法打开视频文件", 400)
                return

            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            # Extract first frame
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if ret and frame is not None:
                cv2.imwrite(first_path, frame)
                rel = os.path.relpath(first_path, ws_path).replace("\\", "/")
                results["first"] = f"/workspace/{rel}"

            # Extract last frame
            if frame_count > 1:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count - 1)
                ret, frame = cap.read()
                if ret and frame is not None:
                    cv2.imwrite(last_path, frame)
                    rel = os.path.relpath(last_path, ws_path).replace("\\", "/")
                    results["last"] = f"/workspace/{rel}"

            cap.release()
            self._send_json(results)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self._send_error_json(f"截取帧失败: {str(e)}", 500)
class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

def main():
    server = ThreadedHTTPServer(("127.0.0.1", PORT), DreamHubHandler)
    print(f"========================================")
    print(f"  DreamHub Server")
    print(f"========================================")
    print(f"  Local:     http://localhost:{PORT}")
    print(f"  TOS:       {TOS_BUCKET} ({TOS_REGION})")
    print(f"  Workspace: {get_workspace_path()}")
    print(f"========================================")
    print(f"")

    def open_browser():
        webbrowser.open(f"http://localhost:{PORT}")

    threading.Timer(0.5, open_browser).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
