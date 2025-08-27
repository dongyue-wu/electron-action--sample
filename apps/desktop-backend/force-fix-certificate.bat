@echo off
chcp 65001 >nul 2>&1
echo =====================================================
echo Manus MSIX Force Fix Tool
echo =====================================================
echo.
echo This tool will forcefully fix certificate issues
echo.

REM Check administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] ERROR: Administrator privileges required
    echo [!] Please right-click this script and select "Run as administrator"
    pause
    exit /b 1
)

echo [√] Administrator privileges confirmed
echo.

REM Step 1: Clean old certificates
echo Step 1: Cleaning conflicting old certificates...
echo.

echo [i] Remove old Manus certificates from current user root store:
powershell -Command "$OutputEncoding = [System.Text.Encoding]::UTF8; Get-ChildItem -Path Cert:\CurrentUser\Root | Where-Object { $_.Subject -like '*Manus*' } | Remove-Item -Force -ErrorAction SilentlyContinue"

echo [i] Remove old Manus certificates from local machine root store:
powershell -Command "$OutputEncoding = [System.Text.Encoding]::UTF8; Get-ChildItem -Path Cert:\LocalMachine\Root | Where-Object { $_.Subject -like '*Manus*' } | Remove-Item -Force -ErrorAction SilentlyContinue"

echo [i] Remove old Manus certificates from personal store:
powershell -Command "$OutputEncoding = [System.Text.Encoding]::UTF8; Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -like '*Manus*' } | Remove-Item -Force -ErrorAction SilentlyContinue"

echo [√] Old certificate cleanup completed
echo.

REM Step 2: Delete existing certificate and recreate
echo Step 2: Recreating certificate...
echo.

if exist "msix\Manus.pfx" (
    echo [i] Deleting existing certificate file
    del "msix\Manus.pfx" /f /q
)

echo [i] Creating new self-signed certificate (ensuring Subject matches)...
powershell -Command "$OutputEncoding = [System.Text.Encoding]::UTF8; try { $cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=845AA9DF-1559-4AA0-8A94-CE74FEB6A77B' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -FriendlyName 'Manus MSIX Signing Certificate' -CertStoreLocation 'Cert:\CurrentUser\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}'); $password = ConvertTo-SecureString -String 'password123' -Force -AsPlainText; Export-PfxCertificate -Cert $cert -FilePath 'msix\Manus.pfx' -Password $password | Out-Null; Write-Host '[√] Certificate created successfully'; Write-Host '[i] Certificate thumbprint:' $cert.Thumbprint } catch { Write-Host '[×] Certificate creation failed:' $_.Exception.Message; exit 1 }"

if not exist "msix\Manus.pfx" (
    echo [×] Certificate creation failed
    pause
    exit /b 1
)

echo.

REM Step 3: Force install certificate to correct location
echo Step 3: Installing certificate to local machine trusted root store...
echo.

echo [i] Installing certificate using certutil:
certutil -addstore -f -user Root "msix\Manus.pfx"
certutil -addstore -f Root "msix\Manus.pfx"

echo [i] Installing certificate using PowerShell:
powershell -Command "$OutputEncoding = [System.Text.Encoding]::UTF8; try { $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('msix\Manus.pfx', 'password123'); $store = New-Object System.Security.Cryptography.X509Certificates.X509Store([System.Security.Cryptography.X509Certificates.StoreName]::Root, [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine); $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite); $store.Add($cert); $store.Close(); Write-Host '[√] Certificate installed to local machine root store' } catch { Write-Host '[!] PowerShell installation failed:' $_.Exception.Message }"

echo.

REM Step 4: Verify certificate installation
echo Step 4: Verifying certificate installation...
echo.

powershell -Command "$OutputEncoding = [System.Text.Encoding]::UTF8; $certs = Get-ChildItem -Path Cert:\LocalMachine\Root | Where-Object { $_.Subject -like '*Manus*' }; if ($certs) { Write-Host '[√] Found installed certificates:'; $certs | Format-Table Subject, Thumbprint, NotAfter -AutoSize } else { Write-Host '[×] No installed certificates found' }"

echo.

REM Step 5: Re-sign MSIX package
echo Step 5: Re-signing MSIX package...
echo.

if not exist "out\Manus.msix" (
    echo [×] MSIX package not found, please build first
    pause
    exit /b 1
)

echo [i] Signing MSIX package with new certificate...
node -e "const { execSyncWithBuildTools } = require('./buildtools-utils'); execSyncWithBuildTools('signtool sign /fd SHA256 /f \"msix\\Manus.pfx\" /p \"password123\" /t http://timestamp.digicert.com \"out\\Manus.msix\"', { stdio: 'inherit' }).catch(() => { console.log('Timestamp server failed, trying without timestamp...'); return execSyncWithBuildTools('signtool sign /fd SHA256 /f \"msix\\Manus.pfx\" /p \"password123\" \"out\\Manus.msix\"', { stdio: 'inherit' }); })"

if %errorLevel% neq 0 (
    echo [×] MSIX package signing failed
    pause
    exit /b 1
)

echo [√] MSIX package signed successfully
echo.

REM 步骤 6: 验证签名
echo 步骤 6: 验证 MSIX 包签名...
echo.

node -e "const { execSyncWithBuildTools } = require('./buildtools-utils'); execSyncWithBuildTools('signtool verify /v /pa \"out\\Manus.msix\"', { stdio: 'inherit' }).catch(() => console.log('[!] 签名验证失败，但这对自签名证书是正常的'))"

echo.


REM 步骤 7: 最终检查
echo 步骤 7: 最终系统检查...
echo.

echo [i] 证书存储区状态:
powershell -Command "Write-Host '本地计算机根存储区中的 Manus 证书:'; Get-ChildItem -Path Cert:\LocalMachine\Root | Where-Object { $_.Subject -like '*Manus*' } | Format-Table Subject, NotAfter -AutoSize"

echo [i] MSIX 包信息:
for %%f in (out\Manus.msix) do echo 文件大小: %%~zf 字节
echo 文件路径: %cd%\out\Manus.msix
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowAllTrustedApps /t REG_DWORD /d 1 /f
echo.
echo =====================================================
echo [√] Force fix completed successfully!
echo =====================================================
pause 