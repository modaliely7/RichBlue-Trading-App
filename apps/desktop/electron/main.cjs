const { app, BrowserWindow } = require('electron')
const path = require('path')
const { spawn, execSync } = require('child_process')
const http = require('http')

const API_PORT = 8001
const API_HOST = '127.0.0.1'
const API_URL = `http://${API_HOST}:${API_PORT}`

let apiProcess = null

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

// ─── Resolve paths to the Python venv and API root ───────────────────────────
function getApiPaths() {
  // When running in dev, __dirname = .../apps/desktop/electron/
  // When packaged, resources/app/electron/ or similar
  const devApiRoot = path.resolve(__dirname, '..', '..', '..', 'apps', 'api')
  const prodApiRoot = path.join(process.resourcesPath || '', 'api')

  const apiRoot = require('fs').existsSync(devApiRoot) ? devApiRoot : prodApiRoot

  const pythonExe = process.platform === 'win32'
    ? path.join(apiRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(apiRoot, '.venv', 'bin', 'python')

  return { apiRoot, pythonExe }
}

// ─── Start the FastAPI server ─────────────────────────────────────────────────
function startApiServer() {
  const { apiRoot, pythonExe } = getApiPaths()

  console.log('[API] Starting server at', apiRoot)
  console.log('[API] Python:', pythonExe)

  killPortSync(API_PORT)

  apiProcess = spawn(
    pythonExe,
    ['-m', 'uvicorn', 'app.main:app', '--host', API_HOST, '--port', String(API_PORT)],
    {
      cwd: apiRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    }
  )

  apiProcess.stdout.on('data', d => console.log('[API]', d.toString().trim()))
  apiProcess.stderr.on('data', d => console.error('[API]', d.toString().trim()))

  apiProcess.on('exit', (code, sig) => {
    console.log(`[API] Process exited (code=${code}, signal=${sig})`)
    apiProcess = null
  })
}

// ─── Wait until the API responds on /health ───────────────────────────────────
function waitForApi(maxWaitMs = 20000) {
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

// ─── Create the renderer window ──────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#0b0f14',
    title: 'RichBlue',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startApiServer()

  try {
    await waitForApi(20000)
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
  stopApiServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopApiServer()
})
