import { app, BrowserWindow, ipcMain, net, protocol, dialog } from 'electron'
import fs from 'fs'
import path from 'node:path'
import { isDev, prepareNext } from 'sc-prepare-next'
import { PORT } from './constants'
import { initLogs } from './utils'

import Logger from 'electron-log'
// 应用名称，用于自定义协议
const APP_PROTOCOL = 'manus'

// temp workaround for Sparse packaging issues
// do not use in production
app.commandLine.appendSwitch('--no-sandbox');

// 存储主窗口引用
let mainWindow: BrowserWindow | null = null

// 日志文件路径
const LOG_PATH = path.join(app.getPath('userData'), 'app.log')
app.setAppUserModelId('im.manus.desktop')
app.setName('Manus')
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      stream: true,
      codeCache: true,
    },
  },
])
/**
 * 增强的日志功能，同时输出到控制台和文件
 */
function enhancedLog(...args: any[]) {
  const logMessage = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
    .join(' ')

  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${logMessage}\n`

  // 输出到控制台
  Logger.info(...args)

  // 输出到文件
  try {
    fs.appendFileSync(LOG_PATH, logEntry)
  } catch (error) {
    console.error('Failed to write to log file:', error)
  }
}

// 确保应用只有一个实例
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  enhancedLog('应用已经在运行，退出当前实例')
  app.quit()
} else {
  function createWindow(): void {
    const appPath = app.getAppPath()
    enhancedLog(appPath)
    enhancedLog('Resources path:', process.resourcesPath)
    mainWindow = new BrowserWindow({
      minWidth: 600,
      minHeight: 400,
      width: 1096,
      height: 800,
      frame: true, // 默认窗口框架
      // transparent: true, // 启用透明
      titleBarStyle: 'hidden', // 隐藏标题栏
      webPreferences: {
        sandbox: false,
        webSecurity: false, // 警告：这会降低应用安全性，仅用于调试

        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    mainWindow.loadURL('app://manus/app')
    mainWindow.setMenu(null)
    mainWindow.webContents.openDevTools()

    // 当窗口关闭时，取消引用
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }

  /**
   * 处理自定义协议的回调
   */
  function handleProtocolCallback(urlStr: string) {
    try {
      const parsedUrl = new URL(urlStr)
      enhancedLog('urlStr:', urlStr)
      enhancedLog('pathname:', parsedUrl.pathname)


      // 处理 create-website 协议
      if (parsedUrl.hostname === 'create-website') {
        const filePath = parsedUrl.searchParams.get('filePath')

        // notice 
        dialog.showMessageBox({
          title: 'Manus',
          message: 'filepath: ' + filePath,
          buttons: ['OK'],
        })
       
        return
      }
      
      
    } catch (error) {
      console.error('Failed to handle protocol callback:', error)
    }
  }

  /**
   * When the application is ready, this function is called.
   */
  app.whenReady().then(async () => {
    initLogs()
    // 注册自定义协议处理器
    protocol.handle('app', (request) => {
      const url = request.url.slice('app://'.length)

      const appPath = app.getAppPath()
      let filePath = ''
      if (url.includes('desktop_frontend')) {
        // 如果URL包含desktop_frontend，直接映射到对应的文件
        filePath = path.join(
          appPath,
          'frontend',
          'out',
          url.replace(/^[^/]*\/desktop_frontend\//, ''),
        )
      } else {
        if (url.startsWith('manus/')) {
          const urlObj = new URL(request.url)
          Logger.info('处理app协议请求2======:', urlObj.pathname)
          let pathname = urlObj.pathname
          if (pathname.startsWith('/app/')) {
            pathname = '/app'
          } else {
            pathname = pathname.replace(/\/$/, '') || '/index' // 默认为 index
          }

          // 动态查找文件
          const possibleFiles = [
            `${pathname.slice(1)}.html`, // 去掉开头的 /，如 /app -> app.html
            'index.html', // 默认首页
          ]

          let foundFile = false
          for (const fileName of possibleFiles) {
            const testPath = path.join(appPath, 'frontend', 'out', fileName)
            if (fs.existsSync(testPath)) {
              filePath = testPath
              foundFile = true
              Logger.info(`找到文件: ${pathname} -> ${fileName}`)
              break
            }
          }

          if (!foundFile) {
            // 如果找不到对应文件，返回默认页面或404页面
            filePath = path.join(appPath, 'frontend', 'out', 'index.html')
            Logger.info(`未找到文件 ${pathname}，使用默认页面`)
          }
        } else {
          enhancedLog('处理app协议请求1======:', url)
          filePath = path.join(appPath, url)
        }
      }

      return net.fetch(`file://${filePath}`)
    })

    // 输出应用信息
    enhancedLog('应用启动信息:')
    enhancedLog('- 应用路径:', app.getAppPath())
    enhancedLog('- 用户数据路径:', app.getPath('userData'))
    enhancedLog('- 开发模式:', isDev ? '是' : '否')
    enhancedLog('- 平台:', process.platform)
    enhancedLog('- 命令行参数:', process.argv)

    // 注册自定义协议
    app.removeAsDefaultProtocolClient(APP_PROTOCOL)
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath)
    } else {
      app.setAsDefaultProtocolClient(APP_PROTOCOL)
    }

    if (!isDev) {
      await prepareNext('./frontend', PORT)
    }

    createWindow()

    // 创建一个显示日志的菜单项
    if (mainWindow) {
      ipcMain.handle('show-logs', () => {
        try {
          if (fs.existsSync(LOG_PATH)) {
            const logs = fs.readFileSync(LOG_PATH, 'utf8')
            return logs
          }
          return '日志文件不存在'
        } catch (error) {
          return `读取日志文件失败: ${error}`
        }
      })
      
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
      if (mainWindow) {
        mainWindow.webContents.send('activate')
      }
    })
  })

  // 处理自定义协议的回调 (Windows)
  app.on('open-url', (event, url) => {
    event.preventDefault()
    enhancedLog('Windows open-url 事件:', url)
    handleProtocolCallback(url)
  })

  // 处理自定义协议的回调 (Windows)
  app.on('second-instance', (_event, commandLine) => {
    enhancedLog('检测到第二个实例，命令行参数:', commandLine)
    // 在 Windows 上，协议 URL 会作为命令行参数传递
    const protocolUrl = commandLine.find((arg) =>
      arg.startsWith(`${APP_PROTOCOL}://`),
    )
    if (protocolUrl) {
      enhancedLog('发现协议URL:', protocolUrl)
      handleProtocolCallback(protocolUrl)
    }

    // 如果已经有一个窗口打开，则聚焦到该窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  /* ++++++++++ events ++++++++++ */
  app.on('window-all-closed', () => {
    if (isDev) {
      app.removeAsDefaultProtocolClient(APP_PROTOCOL)
    }
    if (process.platform !== 'darwin') app.quit()
  })

}
