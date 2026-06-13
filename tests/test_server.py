"""Unit tests for InspoVanna server pure/half-pure functions.

These cover the highest-regression-risk, security-relevant logic without
spinning up the HTTP server or touching the network.
"""
import os

import pytest

import server

# ---- _cache_key ----

def test_cache_key_is_stable():
    assert server._cache_key(b"hello") == server._cache_key(b"hello")


def test_cache_key_differs_for_different_data():
    assert server._cache_key(b"a") != server._cache_key(b"b")


# ---- parse_multipart ----

def test_parse_multipart_extracts_all_fields():
    boundary = "----testboundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="cat.png"\r\n'
        "Content-Type: image/png\r\n"
        "\r\n"
        "BINARYDATA"
        f"\r\n--{boundary}--\r\n"
    ).encode("utf-8")
    parts = server.parse_multipart(body, boundary)
    assert len(parts) == 1
    p = parts[0]
    assert p["name"] == "file"
    assert p["filename"] == "cat.png"
    assert p["content_type"] == "image/png"
    assert p["data"] == b"BINARYDATA"


def test_parse_multipart_ignores_empty_body():
    parts = server.parse_multipart(b"--b--\r\n", "b")
    assert parts == []


# ---- resolve_under (path-traversal defense — the critical one) ----

def test_resolve_under_allows_nested_relative():
    ws = server.get_workspace_path()
    resolved = server.resolve_under(ws, "proj/sub/file.txt")
    assert resolved == os.path.normpath(os.path.join(ws, "proj", "sub", "file.txt"))
    assert resolved.startswith(ws)


def test_resolve_under_rejects_traversal():
    ws = server.get_workspace_path()
    for bad in ["../outside", "/etc/passwd", "proj/../../.."]:
        with pytest.raises(ValueError):
            server.resolve_under(ws, bad)


def test_resolve_under_root_when_empty():
    ws = server.get_workspace_path()
    assert server.resolve_under(ws, "") == ws


# ---- create_project name sanitization ----

def test_create_project_strips_path_separators():
    result = server.create_project("a/b\\c..d")
    # "/", "\", and ".." all removed -> "abcd"
    assert result["name"] == "abcd"
    assert os.path.isdir(result["path"])


def test_create_project_rejects_empty_after_sanitize():
    with pytest.raises(ValueError):
        server.create_project("../")  # sanitizes to ""


def test_create_project_rejects_duplicate():
    server.create_project("dup")
    with pytest.raises(ValueError):
        server.create_project("dup")


# ---- _safe_config (secret masking) ----

def test_safe_config_masks_secrets_as_bool():
    safe = server._safe_config()
    vol = safe["volcano"]
    assert vol["ark_api_key"] is True        # "test-key" -> True
    assert vol["tos_ak"] is False            # "" -> False
    assert vol["tos_sk"] is False            # "" -> False
    assert vol["ai_mediakit_api"] is True    # "amk-key" -> True
    # non-secret fields are preserved
    assert vol["tos_region"] == "cn-beijing"
    assert vol["tos_bucket"] == "test-bucket"


# ---- validate_filename (Windows-illegal char defense) ----

def test_validate_filename_rejects_windows_illegal_chars():
    for bad in ['a<b', 'a>b', 'a:b', 'a"b', 'a/b', 'a\\b', 'a|b', 'a?b', 'a*b']:
        assert server.validate_filename(bad) is not None, f"should reject {bad!r}"


def test_validate_filename_accepts_clean_names():
    for ok in ["正常文件.png", "test file (1).txt", "café.jpg", "中文名称"]:
        assert server.validate_filename(ok) is None


def test_validate_filename_rejects_empty_and_dot():
    assert server.validate_filename("") is not None
    assert server.validate_filename("   ") is not None
    assert server.validate_filename(".") is not None
    assert server.validate_filename("..") is not None
