@echo off
chcp 65001 >nul 2>&1
title InspoVanna

if not exist ".venv\Scripts\python.exe" (
    echo ========================================
    echo   First run, setting up environment...
    echo ========================================
    echo.

    where python >nul 2>&1
    if %errorlevel% neq 0 (
        echo [!] Python not found, installing ...
        winget --version >nul 2>&1
        if %errorlevel% equ 0 (
            winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
            set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts"
        ) else (
            echo.
            echo [ERROR] Please install Python: https://www.python.org/downloads/
            echo         Check "Add Python to PATH" during installation
            pause
            exit /b 1
        )
    )

    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )

    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip -q
    pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )

    echo.
    echo   Setup complete!
    echo.
)

REM ---- Generate app icon (first run) ----
if not exist "src\resource\favicon.ico" (
    call .venv\Scripts\activate.bat
    echo   Generating app icon...
    python src\setup_icon.py
)

REM ---- Create desktop shortcut (first run) ----
if not exist "%USERPROFILE%\Desktop\InspoVanna.lnk" (
    call .venv\Scripts\activate.bat
    echo   Creating desktop shortcut...
    python src\setup_shortcut.py
)

call .venv\Scripts\activate.bat
python src\server.py
pause
