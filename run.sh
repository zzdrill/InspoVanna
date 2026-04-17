#!/bin/bash

cd "$(dirname "$0")"

# ---- First run: auto-create virtual environment and install dependencies ----
if [ ! -f ".venv/bin/python" ]; then
    echo "========================================"
    echo "  First run, setting up environment..."
    echo "========================================"
    echo ""

    # Check Python
    PYTHON_CMD=""
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    fi

    if [ -z "$PYTHON_CMD" ]; then
        echo "[!] Python not found, installing ..."
        if command -v brew &> /dev/null; then
            brew install python@3.12
            PYTHON_CMD="python3"
        else
            echo ""
            echo "[ERROR] Please install Python: https://www.python.org/downloads/"
            exit 1
        fi
    fi

    echo "  Python: $($PYTHON_CMD --version 2>&1)"
    echo ""

    $PYTHON_CMD -m venv .venv
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to create virtual environment"
        exit 1
    fi

    source .venv/bin/activate
    pip install --upgrade pip -q
    pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to install dependencies"
        exit 1
    fi

    echo ""
    echo "  Setup complete!"
    echo ""
fi

# ---- Start server ----
source .venv/bin/activate
python server.py
