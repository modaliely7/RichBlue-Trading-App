# AI Development & Maintenance Instructions

> [!IMPORTANT]
> **READ THIS FILE BEFORE MAKING ANY CHANGES.**
> **UPDATE THIS FILE EVERY TIME YOU MAKE ARCHITECTURAL CHANGES OR FIX CRITICAL BUGS.**
> This file ensures that the application maintains its stability and that previously resolved errors do not recur.

---

## 🏗️ Core Architecture Rules



### 2. Electron + Vite Production Build
- **Base Path**: Always keep `base: './'` in `apps/desktop/vite.config.ts`.
- **Routing**: Always use `HashRouter` instead of `BrowserRouter` in `apps/desktop/src/main.tsx`.
- **Reason**: The `file://` protocol used in production does not support the HTML5 History API or absolute asset paths.

### 3. Backend Dependencies (PyInstaller)
- If you add new Python packages, you **must** update the `requirements.txt` and ensure they are compatible with PyInstaller.
- **xlsxwriter**: Required for Excel exports.
- **reportlab**: Use `colors.HexColor` (case-sensitive), NOT `colors.hexColor`.

---

## 🛠️ Build & Deployment Workflow

1. **Frontend Changes**: Test via `npm run dev` in `apps/desktop`.
2. **Backend Changes**: Test via `python -m uvicorn app.main:app` in `apps/api`.
3. **Packaging**: Run `.\build.ps1` from the project root.
   - Ensure the application is **fully closed** before building, or the process will fail with `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`.

---

## 📜 Resolved Error History (Preventative Measures)

| Error | Cause | Fix |
| :--- | :--- | :--- |
| **Blank Screen in EXE** | Vite `base` was `/` (absolute). | Set `base: './'` in `vite.config.ts`. |
| **PDF Export 500 Error** | Case-sensitivity in `reportlab`. | Changed `hexColor` to `HexColor`. |
| **Excel Export 500 Error** | Missing `xlsxwriter` package. | Installed `xlsxwriter` in API venv. |
| **422 Unprocessable Entity** | Residual `trade_type` in API calls. | Fully removed field from frontend/backend. |
| **Build File Lock** | Application open during build. | Close `RichBlue.exe` and `api.exe` before running `build.ps1`. |

---

## 💡 Future Expansion Prompts (Use these for continuity)
- "Implement advanced TradingView charting for symbol analysis."
- "Add automated weekly database backups."
- "Expand asset classes to support Options trading."
