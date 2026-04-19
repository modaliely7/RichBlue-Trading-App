# Trading Analytics Platform - Detailed Functional Blueprint

This document provides an exhaustive functional breakdown of every component in the system, designed to allow complete reconstruction and deep understanding of the platform's logic.

---

## 1. System Overview
The platform is a professional-grade trading dashboard that provides multi-account tracking, advanced financial analytics, and emotional journaling. It is built as a **Monorepo** using a **FastAPI** backend and an **Electron + React** frontend.

### Core Philosophy
- **Multi-Account**: Distinguishes between "Real" and "Testing" accounts.
- **Data Integrity**: Uses a "Single Source of Truth" approach for financial calculations.
- **Rich Visualization**: Uses glassmorphic design and interactive charts to make complex data readable.

---

## 2. Backend Functional Detail (`apps/api`)

### 2.1 Database & Models (`models.py`)
- **`Account`**: Manages account identity and type (Real/Testing). Soft-deletion via `is_active`.
- **`Trade`**: The heart of the system. Stores entry/exit prices, fees, strategy, and notes. Linked to an `Account`.
- **`CashTransaction`**: Tracks every cent. Types include `Deposit`, `Withdraw`, `Trade Buy/Sell`, and `Adjustment`.
- **`Asset`**: Tracks current inventory of stocks/funds to calculate cost basis and market value.
- **`StockMetrics` & `PriceHistory`**: Caching layer for fundamental and historical price data.
- **`PsychologyEntry`**: Quantitative tracking of emotional states (FOMO, Fear, Confidence) during trading.
- **`Lesson`**: A knowledge base of trading insights, optionally linked to specific trades.

### 2.2 Analysis Engines
#### Quantitative Engine (`engine_quant.py`)
- **Relative Volume (RVOL)**: Detects institutional activity by comparing current volume to a 20-day SMA.
- **Accumulation/Distribution**: Uses Chaikin Money Flow (CMF) to see if a stock is being bought or sold in bulk.
- **Breakout Probability**: A proprietary calculation using ATR (Average True Range) to detect "volatility contraction" preceding a potential breakout.
- **Quantitative Score**: A 0-100 score based on volume strength, accumulation, and breakout potential.

#### Technical Engine (`engine_technicals.py`)
- **Trend Analysis**: Uses SMA (20, 50, 200) and EMA (20) to determine trend direction.
- **Momentum**: RSI and MACD (with signal crossovers) to identify overbought/oversold conditions and momentum shifts.
- **Volatility**: Bollinger Bands to detect price extremes and potential mean reversion.
- **Signal Generation**: Produces human-readable signals like "MACD Bullish Crossover" or "RSI Overbought".

#### Fundamentals Engine (`fundamentals.py`)
- **Valuation Models**: 
    - **Fair Value P/E**: Price estimate based on a standard 15x earnings multiple.
    - **Fair Value PEG**: Price estimate adjusted for growth rates.
- **Growth Analysis**: Calculates CAGR (Compound Annual Growth Rate) for Revenue and EPS over historical periods.
- **Financial Health**: Debt-to-Equity and Current Ratio calculations.
- **Fundamental Score**: A weighted 100-point score across Growth, Profitability, Health, Valuation, and Cash Flow.

### 2.3 Portfolio Mathematics (`portfolio_math.py`)
This module is the "Single Source of Truth" for all money logic.
- **Realized PnL**: Sum of `(Exit Price - Entry Price) * Quantity - Fees`.
- **Unrealized PnL**: `(Current Market Price - Entry Price) * Quantity`.
- **Portfolio Value (Realized)**: `Net Deposited + Realized PnL`.
- **Portfolio Value (Liquidation)**: `Free Cash + Current Market Value of Assets`.
- **Net Deposited**: `Total Deposits - Total Withdrawals`.

### 2.4 Data Providers (`data_providers.py`)
- **Primary (yfinance)**: Fetches prices and full financial statements (Balance Sheet, Cash Flow).
- **Secondary (Scrapers)**: Custom BeautifulSoup4 scrapers for **EGX (Egypt)**, **TradingView**, **Investing.com**, and **Yahoo Finance**.
- **Normalization**: All providers output a standardized dictionary to ensure the engines can process data regardless of the source.

---

## 3. Frontend Functional Detail (`apps/desktop`)

### 3.1 State & Data Flow
- **`AccountContext`**: A React Context that persists the selected `account_id` in local storage and provides it to all API calls.
- **React Query (`tanstack-query`)**: Every page uses hooks (e.g., `useQuery(['overview', accountId])`) to fetch data. Mutations (logging trades/cash) automatically invalidate relevant queries to trigger a UI refresh.

### 3.2 Core Pages
- **`DashboardPage`**:
    - **Hero KPIs**: Real-time display of Portfolio Value, Realized/Unrealized P&L, and Win Rate.
    - **Equity Curve**: A Chart.js line chart showing the historical growth of the account.
    - **Monthly Bar Chart**: Visualizes P&L performance per month.
    - **Cash Management**: Form for deposits/withdrawals.
- **`JournalPage`**:
    - **Trade List**: A dense, searchable table of all trades.
    - **Trade Detail**: Modal view showing notes, strategies, and performance metrics for a single trade.
- **`AnalyticsPage`**:
    - Detailed breakdowns of performance by **Strategy**, **Day of Week**, and **Hour of Day**.
    - Identifies "Best/Worst" performers to help traders refine their edge.
- **`AiCoachPage`**:
    - Correlates emotional states (`PsychologyEntry`) with trade outcomes.
    - Provides feedback on whether emotions like "Fear" or "FOMO" are hurting performance.
- **`StockFundamentalsPage`**:
    - A deep-dive view into a specific ticker's health, showing valuation gaps and financial scores.

### 3.3 Components
- **`Sidebar`**: Main navigation with account-aware links.
- **`OverviewSyncBar`**: A global status bar showing when data was last refreshed and the connection status to the API.
- **`KpiCard`**: A reusable, glassmorphic card for displaying metrics with positive/negative color coding.

---

## 4. Operational Workflows

### 4.1 Logging a Trade
1. User enters trade details in the UI.
2. Frontend sends `POST /trades` to the API.
3. API creates the `Trade` record and a corresponding `CashTransaction` (type `Trade Buy`).
4. API triggers a "background" refresh of the symbol's fundamentals and price history.
5. Frontend invalidates the `overview` query, and the Dashboard updates to show the new position and reduced cash balance.

### 4.2 Reconstructing the Environment
- **Backend**: Python 3.10+, `pip install -r requirements.txt`, `alembic upgrade head`.
- **Frontend**: Node.js, `npm install`, `npm run dev`.
- **Connectivity**: Frontend expects API at `http://localhost:8000`.

