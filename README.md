# 💎 RichBlue Pro Analytics

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/modaliely7/Trading-App-curser)
[![Platform](https://img.shields.io/badge/platform-Windows-brightgreen.svg)](https://github.com/modaliely7/Trading-App-curser)
[![License](https://img.shields.io/badge/license-MIT-orange.svg)](https://github.com/modaliely7/Trading-App-curser)
[![Aesthetics](https://img.shields.io/badge/UI-Premium%20Glassmorphism-purple.svg)](https://github.com/modaliely7/Trading-App-curser)

> **RichBlue Pro Analytics** is a high-performance, data-driven trading journal and financial intelligence dashboard. Designed for professional traders who demand precision, security, and premium aesthetics.

---

## ✨ Key Features

### 📊 Elite Dashboard
The command center for your capital. Experience a unified view of your financial health with real-time equity curves and portfolio radar.
- **Dynamic PnL Tracking**: Monitor realized vs. liquidation value with precision.
- **Smart Cash Management**: One-click deposits/withdrawals with an automated ledger.
- **Asset Allocation Radar**: Visualize your exposure across Stocks, Funds, and Cash instantly.

### 📓 Advanced Trade Journal
A zero-friction logging experience tailored for speed and detail.
- **Unified Trade Model**: Simplified entry logic for Stocks, Crypto, Forex, and Funds.
- **Auto-Fee Calculation**: Built-in logic for automatic fee deduction `(Value * 0.125%) + 3`.
- **Strategy Tagging**: Link every trade to your custom edge and edge-case strategies.

### 🎯 Strategy Intelligence
Refine your edge with deep analytics.
- **Win-Rate Heatmaps**: Identify which strategies deliver the highest expectancy.
- **Time-Series Analysis**: Discover your most profitable trading hours and days.
- **Performance Reports**: Export professional PDF and Excel reports with a single click.

### ⚙️ Premium Settings & Customization
A completely redesigned settings interface with glassmorphism aesthetics.
- **Multi-Account Support**: Manage up to 3 independent trading portfolios.
- **Theme Engine**: Choose between Midnight Blue, Deep Ocean, Emerald City, and more.
- **Data Sovereignty**: Local-first architecture. Backup, restore, or wipe your data instantly.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite, Chart.js, TanStack Query |
| **Backend** | FastAPI (Python 3.13), SQLAlchemy, SQLite |
| **Desktop** | Electron 37 (Native Windows Wrapper) |
| **Styles** | Vanilla CSS (Premium Design System) |

---

## 🚀 Getting Started

### 📦 Standalone Distribution (Recommended)
For the best experience, use our one-click Windows installer:
1. Navigate to `dist-installer/`.
2. Run `RichBlue Setup 1.0.0.exe`.
3. Start trading.

### 👨‍💻 Development Setup

1. **Clone & Install**:
   ```bash
   git clone https://github.com/modaliely7/Trading-App-curser.git
   cd Trading-App-curser
   npm install
   ```

2. **Backend Setup**:
   ```bash
   cd apps/api
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Launch Dev Environment**:
   ```bash
   # From root
   npm run dev
   ```

---

## 🏗️ Build Pipeline

To generate a new standalone Windows installer:
```powershell
.\build.ps1
```
*Requires PowerShell with execution permissions.*

---

## 🛡️ AI & Maintenance
This project includes a dedicated `AI_INSTRUCTIONS.md` file. If you are using an AI coding assistant, ensure it reads that file before making any modifications to preserve architectural integrity.

---

## 📄 License
Copyright © 2025 RichBlue Pro Analytics. Licensed under the MIT License.
