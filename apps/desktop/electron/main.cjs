const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require('electron')
const path = require('path')
const { spawn, execSync } = require('child_process')
const http = require('http')
const fs = require('fs')

const API_PORT = 8001
const API_HOST = '127.0.0.1'
const API_URL = `http://${API_HOST}:${API_PORT}`

let apiProcess = null
let mainWindow = null
let tray = null
let isQuitting = false

// ─── Kill any process already using the API port ─────────────────────────────
function killPortSync(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr ":${port} "`, { encoding: 'utf8', timeout: 3000 })
      const pids = [...new Set(
        out.split('\n')
          .map(l => l.trim().split(/\s+/).pop())
          .filter(p => p && p !== '0' && /^\d+$/.test(p))
      )]
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { timeout: 2000 }) } catch (_) {}
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { timeout: 3000 })
    }
  } catch (_) {
    // No process on the port — that's fine
  }
}

// ─── Resolve paths to the API executable ─────────────────────────────────────
function getApiPaths() {
  const isProd = app.isPackaged

  if (isProd) {
    // In production: resources/api/api.exe  (copied by electron-builder extraResources)
    const apiRoot = path.join(process.resourcesPath, 'api')
    const apiExe = process.platform === 'win32'
      ? path.join(apiRoot, 'api.exe')
      : path.join(apiRoot, 'api')
    return { apiRoot, apiExe, useExe: true }
  } else {
    // In dev: use the .venv python + uvicorn
    const apiRoot = path.resolve(__dirname, '..', '..', '..', 'apps', 'api')
    const pythonExe = process.platform === 'win32'
      ? path.join(apiRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(apiRoot, '.venv', 'bin', 'python')
    return { apiRoot, pythonExe, useExe: false }
  }
}

// ─── Start the API server ─────────────────────────────────────────────────────
function startApiServer() {
  const { apiRoot, apiExe, pythonExe, useExe } = getApiPaths()
  killPortSync(API_PORT)

  if (useExe) {
    // Production: launch the PyInstaller-compiled api.exe directly
    console.log('[API] Starting production server:', apiExe)
    apiProcess = spawn(apiExe, [], {
      cwd: apiRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })
  } else {
    // Dev: launch via python -m uvicorn
    console.log('[API] Starting dev server via python at', apiRoot)
    apiProcess = spawn(
      pythonExe,
      ['-m', 'uvicorn', 'app.main:app', '--host', API_HOST, '--port', String(API_PORT)],
      {
        cwd: apiRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      }
    )
  }

  apiProcess.stdout?.on('data', d => console.log('[API]', d.toString().trim()))
  apiProcess.stderr?.on('data', d => console.error('[API]', d.toString().trim()))

  apiProcess.on('exit', (code, sig) => {
    console.log(`[API] Process exited (code=${code}, signal=${sig})`)
    apiProcess = null
  })
}

// ─── Wait until the API responds on /health ───────────────────────────────────
function waitForApi(maxWaitMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      http.get(`${API_URL}/health`, res => {
        if (res.statusCode === 200) {
          clearInterval(interval)
          console.log('[API] Ready ✓')
          resolve()
        }
      }).on('error', () => {
        if (Date.now() - start > maxWaitMs) {
          clearInterval(interval)
          reject(new Error('API did not start in time'))
        }
      })
    }, 500)
  })
}

// ─── Stop the API process on quit ────────────────────────────────────────────
function stopApiServer() {
  if (!apiProcess) return
  console.log('[API] Stopping server…')
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${apiProcess.pid} /T /F`, { timeout: 3000 })
    } else {
      process.kill(-apiProcess.pid, 'SIGTERM')
    }
  } catch (_) {}
  apiProcess = null
}

// ─── Create / show the main window ───────────────────────────────────────────
function createWindow() {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f14',
    title: 'RichBlue',
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      if (process.platform === 'win32') {
        tray?.displayBalloon({
          iconType: 'info',
          title: 'RichBlue',
          content: 'App is running in the background. Right-click the tray icon to open or quit.',
        })
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'icon.ico')
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('RichBlue Trading')

  const buildMenu = () => {
    const loginItemSettings = app.getLoginItemSettings()
    const startupEnabled = loginItemSettings.openAtLogin

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open RichBlue',
        click: () => {
          createWindow()
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      { type: 'separator' },
      {
        label: startupEnabled ? '✓ Launch on Windows Startup' : 'Launch on Windows Startup',
        click: () => {
          const current = app.getLoginItemSettings().openAtLogin
          app.setLoginItemSettings({ openAtLogin: !current })
          // Rebuild menu to reflect new state
          tray.setContextMenu(buildMenu())
        },
      },
      { type: 'separator' },
      {
        label: 'Quit RichBlue',
        click: () => {
          isQuitting = true
          stopApiServer()
          app.quit()
        },
      },
    ])
    return menu
  }

  tray.setContextMenu(buildMenu())

  tray.on('double-click', () => {
    createWindow()
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createTray()
  startApiServer()

  try {
    await waitForApi(30000)
  } catch (e) {
    console.error('[API] Failed to start:', e.message)
    // Open window anyway — the app will show connection errors in UI
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Do NOT quit — let the tray keep the app alive
  // Only quit on Darwin if there's no tray (standard macOS behavior)
  if (process.platform === 'darwin' && !tray) {
    stopApiServer()
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  stopApiServer()
})
