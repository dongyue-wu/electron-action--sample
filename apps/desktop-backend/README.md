📱 Windows 开始菜单和磁贴

SmallTile.png (71x71px)

- Windows 开始菜单中的小磁贴
- 任务栏中的应用图标

Square150x150Logo.png (150x150px)

- Windows 开始菜单中的中等磁贴
- 应用列表中的图标

Wide310x150Logo.png (310x150px)

- Windows 开始菜单中的宽磁贴
- 提供更大的显示区域

LargeTile.png (310x310px)

- Windows 开始菜单中的大磁贴
- 最大尺寸的磁贴显示

🏪 Microsoft Store
StoreLogo.png (50x50px)

- Microsoft Store 中的应用图标
- 搜索结果中显示

BadgeLogo.png (24x24px)

- 磁贴上的徽章图标
- 通知和状态指示

🖥️ 系统界面
Square44x44Logo.png (44x44px)

- 应用列表中的图标
- 设置页面中的应用图标

Square44x44Logo.targetsize-48_altform-lightunplated.png

- 48x48px 尺寸的图标
- 浅色主题下使用
- 无背景板样式

Square44x44Logo.targetsize-48_altform-unplated.png

- 48x48px 尺寸的图标
- 通用样式，无背景板

🎨 主题适配图标
Square150x150Logo.altform-darkunplated_targetsize-150.png

- 150x150px 尺寸
- 深色主题下使用
- 无背景板样式

Square150x150Logo.altform-lightunplated_targetsize-150.png

- 150x150px 尺寸
- 浅色主题下使用
- 无背景板样式

🚀 启动界面
SplashScreen.png (620x300px)

- 应用启动时的闪屏图片
- 显示在应用加载过程中

## Use

```sh

```

## Help

- [Electronjs - documentation](https://www.electronjs.org/pt/docs/latest/)
- [Any Linux Target](https://www.electron.build/linux)

## NPM Commands

### development

- `npm run dev`: Run Electron with development build.
  - `npm run build:backend`: Build backend with TypeScript.
  - `electron . --dev`: Run Electron with development build.
- `npm run next nextDev`: Run next js

### build

- `npm run prebuild`: Remove build and dist directories.
- `npm run build`: Build frontend and backend.
  - `npm run build:frontend`: Build frontend with Next.js.
  - `npm run build:backend`: Build backend with TypeScript.
- `npm run postinstall`: Install dependencies for Electron.
- `npm run dist`: Build and make a distribution package with Electron Builder.

# 创建自签名证书

$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=845AA9DF-1559-4AA0-8A94-CE74FEB6A77B" -KeyUsage DigitalSignature -FriendlyName "Manus AI Certificate" -CertStoreLocation "Cert:\CurrentUser\My" -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")

# 查看证书指纹，记录下来以便后续使用

$cert.Thumbprint

# 设置证书密码

$password = ConvertTo-SecureString -String "123456s89S." -Force -AsPlainText

# 导出为PFX文件

Export-PfxCertificate -Cert $cert -FilePath "ManusAI.pfx" -Password $password

# 可选：导出公钥证书（.cer文件）用于验证

Export-Certificate -Cert $cert -FilePath "C:\Users\yx\ManusAI.cer"

# 验证证书

Get-AuthenticodeSignature C:\Users\yx\Downloads\ManusAI.manus.im_0.1.1.0_x64__vajzd2mq3s8wj.msix
