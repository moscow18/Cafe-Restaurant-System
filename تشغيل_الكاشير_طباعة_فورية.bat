@echo off
chcp 65001 >nul
title تشغيل كافيه برو - طباعة فورية بدون شاشة ريفيو
echo ========================================================
echo   جاري تشغيل كافيه برو بوضع الطباعة الفورية المباشرة...
echo   (Silent Kiosk Printing - XP-80C)
echo ========================================================

REM البحث عن متصفح Google Chrome
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing "http://localhost:3344/renderer/pos-invoice.html"
    exit
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk-printing "http://localhost:3344/renderer/pos-invoice.html"
    exit
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --kiosk-printing "http://localhost:3344/renderer/pos-invoice.html"
    exit
)

REM إذا لم يتوفر Chrome، تشغيل Microsoft Edge بوضع Kiosk Printing
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk-printing "http://localhost:3344/renderer/pos-invoice.html"
    exit
)
if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files\Microsoft\Edge\Application\msedge.exe" --kiosk-printing "http://localhost:3344/renderer/pos-invoice.html"
    exit
)

echo [تنبيه] لم يتم العثور على متصفح Chrome أو Edge تلقائياً.
pause
