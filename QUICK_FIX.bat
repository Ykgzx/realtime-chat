@echo off
echo ========================================
echo   Chat App - Quick Firewall Fix
echo ========================================
echo.
echo This will add a firewall rule to allow Port 3000
echo.
pause

netsh advfirewall firewall add rule name="Chat App Port 3000" dir=in action=allow protocol=TCP localport=3000

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   SUCCESS! Firewall rule added.
    echo ========================================
    echo.
    echo Now try accessing from iPhone:
    echo   http://172.17.1.181:3000
    echo.
) else (
    echo.
    echo ========================================
    echo   ERROR: Please run as Administrator
    echo ========================================
    echo.
    echo Right-click this file and select:
    echo   "Run as administrator"
    echo.
)

pause
