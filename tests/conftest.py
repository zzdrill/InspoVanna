"""Pytest configuration: make `src/` importable and seed server globals.

Every test gets a fresh tmp_path workspace and an in-memory config, so the real
config.json and the TOS network are never touched.
"""
import os
import sys

import pytest

_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)


@pytest.fixture(autouse=True)
def server_env(tmp_path):
    """Initialize server runtime globals with a minimal isolated config."""
    import server

    server._initialize(config={
        "volcano": {
            "ark_api_key": "test-key",
            "tos_ak": "",
            "tos_sk": "",
            "tos_region": "cn-beijing",
            "tos_bucket": "test-bucket",
            "ai_mediakit_api": "amk-key",
        },
        "workspace": {"path": str(tmp_path)},
        "models": {},
    })
    yield server
