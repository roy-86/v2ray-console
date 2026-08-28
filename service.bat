@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM  v2ray-console service manager (wrapper via NSSM)
REM  Usage:
REM     service.bat install    Install and start the service
REM     service.bat uninstall  Stop and remove the service
REM     service.bat start      Start the service
REM     service.bat stop       Stop the service
REM     service.bat restart    Restart the service
REM     service.bat status     Show service status
REM     service.bat            (no argument) interactive menu
REM ============================================================

REM ---------- Editable settings ----------
set "APPDIR=D:\v2ray-console"
set "EXE=%APPDIR%\v2ray-console.exe"
set "NSSM=%APPDIR%\nssm.exe"
set "SVC=v2ray-console"
set "LOGDIR=%APPDIR%\logs"
set "DISPLAYNAME=v2ray-console"

REM ---------- Admin check / auto elevate (reg query needs no child window) ----------
reg query "HKU\S-1-5-19" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Administrator rights are required. Requesting elevation...
    if "%~1"=="" (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    ) else (
        powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%~1' -Verb RunAs"
    )
    exit /b
)

REM ---------- Basic validation ----------
if not exist "%EXE%" (
    echo [ERROR] Executable not found: %EXE%
    goto :fail
)
if not exist "%NSSM%" (
    echo [ERROR] nssm.exe not found: %NSSM%
    goto :fail
)
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

REM ---------- Dispatch ----------
if /i "%~1"=="install"   goto :install
if /i "%~1"=="uninstall" goto :uninstall
if /i "%~1"=="start"     goto :start
if /i "%~1"=="stop"      goto :stop
if /i "%~1"=="restart"   goto :restart
if /i "%~1"=="status"    goto :status
if /i "%~1"==""          goto :menu
echo [ERROR] Unknown argument: %~1
goto :menu

REM ============================================================
:install
call :svc_exists
if %EXIST%==1 (
    echo [WARN] Service "%SVC%" already exists. Run uninstall first to reinstall.
    goto :end
)
echo [1/3] Registering service ...
"%NSSM%" install "%SVC%" "%EXE%"
if %errorlevel% neq 0 ( echo [ERROR] Failed to register service. & goto :fail )

echo [2/3] Configuring service ...
"%NSSM%" set "%SVC%" AppDirectory          "%APPDIR%"
"%NSSM%" set "%SVC%" DisplayName           "%DISPLAYNAME%"
"%NSSM%" set "%SVC%" Description           "v2ray-console wrapped as a Windows service by NSSM"
"%NSSM%" set "%SVC%" Start                 SERVICE_AUTO_START
"%NSSM%" set "%SVC%" AppStdout             "%LOGDIR%\service-out.log"
"%NSSM%" set "%SVC%" AppStderr             "%LOGDIR%\service-err.log"
"%NSSM%" set "%SVC%" AppStdoutCreationDisposition 4
"%NSSM%" set "%SVC%" AppStderrCreationDisposition 4
"%NSSM%" set "%SVC%" AppRotateFiles        1
"%NSSM%" set "%SVC%" AppRotateOnline       1
"%NSSM%" set "%SVC%" AppRotateBytes        10485760
"%NSSM%" set "%SVC%" AppExit               Default Restart
"%NSSM%" set "%SVC%" AppRestartDelay       5000

echo [3/3] Starting service ...
"%NSSM%" start "%SVC%"
if %errorlevel% neq 0 ( echo [ERROR] Failed to start. Check logs: %LOGDIR% & goto :fail )

echo.
echo [OK] Service "%SVC%" installed and started (auto-start on boot).
echo      Log folder: %LOGDIR%
goto :end

REM ------------------------------------------------------------
:uninstall
call :svc_exists
if %EXIST%==0 (
    echo [INFO] Service "%SVC%" does not exist. Nothing to remove.
    goto :end
)
echo Stopping service ...
"%NSSM%" stop "%SVC%"
timeout /t 2 /nobreak >nul
echo Removing service ...
"%NSSM%" remove "%SVC%" confirm
if %errorlevel% neq 0 ( echo [ERROR] Failed to remove service. & goto :fail )
echo [OK] Service "%SVC%" stopped and removed.
goto :end

REM ------------------------------------------------------------
:start
call :svc_exists
if %EXIST%==0 ( echo [INFO] Service not installed. Run install first. & goto :end )
"%NSSM%" start "%SVC%"
if %errorlevel% equ 0 (echo [OK] Service started.) else (echo [ERROR] Start failed.)
goto :end

:stop
call :svc_exists
if %EXIST%==0 ( echo [INFO] Service not installed. & goto :end )
"%NSSM%" stop "%SVC%"
if %errorlevel% equ 0 (echo [OK] Service stopped.) else (echo [ERROR] Stop failed.)
goto :end

:restart
call :svc_exists
if %EXIST%==0 ( echo [INFO] Service not installed. Run install first. & goto :end )
"%NSSM%" restart "%SVC%"
if %errorlevel% equ 0 (echo [OK] Service restarted.) else (echo [ERROR] Restart failed.)
goto :end

:status
call :svc_exists
if %EXIST%==0 ( echo [INFO] Service not installed. & goto :end )
sc query "%SVC%" | findstr /C:"STATE"
goto :end

REM ============================================================
:menu
echo.
echo     ============================================
echo       v2ray-console service manager (NSSM)
echo       Service name: %SVC%
echo     ============================================
echo       [1] Install and start
echo       [2] Stop
echo       [3] Start
echo       [4] Restart
echo       [5] Uninstall
echo       [6] Status
echo       [0] Exit
echo     --------------------------------------------
set "CHOICE="
set /p CHOICE=Select an option and press Enter:
if "%CHOICE%"=="1" goto :install
if "%CHOICE%"=="2" goto :stop
if "%CHOICE%"=="3" goto :start
if "%CHOICE%"=="4" goto :restart
if "%CHOICE%"=="5" goto :uninstall
if "%CHOICE%"=="6" goto :status
if "%CHOICE%"=="0" goto :end
echo [Invalid choice]
goto :menu

REM ---------- Subroutine ----------
:svc_exists
set "EXIST=0"
sc query "%SVC%" >nul 2>&1
if %errorlevel% equ 0 set "EXIST=1"
goto :eof

REM ---------- Endings ----------
:fail
echo.
pause
endlocal
exit /b 1

:end
if "%~1"=="" pause
endlocal
exit /b 0
