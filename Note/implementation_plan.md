# Trading App Overhaul & New Analysis Tabs

This plan addresses a comprehensive overhaul of the trading dashboard, correcting portfolio math, implementing three new advanced analysis tabs (Fundamental, Technical, Smart Money), and upgrading the overall UI/UX to a premium, modern design.

## User Review Required

> [!WARNING]
> **Database Migrations**
> I will be creating new SQLAlchemy models (`TechnicalMetrics`, `QuantitativeMetrics`) and modifying existing ones to store all the new calculations. A database migration will be required.

> [!IMPORTANT]
> **Data Sources**
> The application will primarily use `yfinance` to fetch financial data, as it is robust, free, and does not require API keys. This is the most reliable way to gather EPS, revenue, debt, historical OHLCV, etc., without requiring you to purchase premium data subscriptions.

## Open Questions

> [!CAUTION]
> 1. **Export/Import Trades:** You requested this feature. Should it be placed at the bottom of the main Dashboard page, or on the Trades (Journal) page?
> 2. **UI Framework:** The project uses standard CSS modules. I will upgrade `index.css` to feature a highly premium glassmorphic dark theme. Is there a specific color palette you prefer (e.g., Emerald Green, Royal Purple, Neon Blue)?
> 3. **Database:** Does the current `sqlite` database have existing data you want to preserve, or can we safely reset/upgrade the schema?

## Proposed Changes

---

### Backend Data Layer & Database (FastAPI)

We will introduce new SQLAlchemy models to cache the analysis data to prevent redundant API calls to `yfinance`.

#### [MODIFY] apps/api/app/models.py
- Add `TechnicalMetrics` model to store SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Support/Resistance, and the Technical Score.
- Add `QuantitativeMetrics` model to store RVOL, A/D, CMF, Breakout Probability, and Quantitative Score.
- Ensure `StockMetrics` has all the fields required for the Fundamental Analysis (P/E, PEG, Fair Value, Fundamental Score).

#### [MODIFY] apps/api/app/schemas.py
- Add Pydantic schemas for the new models to facilitate API responses (e.g., `TechnicalMetricsRead`, `QuantitativeMetricsRead`, `FundamentalMetricsRead`).

---

### Backend Computation Engines

We will implement three distinct engines that fetch data using `yfinance` and run the required financial math.

#### [NEW] apps/api/app/engine_fundamentals.py
- Implements the Fundamental Evaluation Engine.
- Fetches EPS, Revenue, Debt, Cash, Equity, Market Cap.
- Calculates P/E, PEG, EV/EBITDA, ROE, Debt/Equity.
- Calculates Fair Value models (P/E relative and PEG growth).
- Calculates the Fundamental Score (0-100).

#### [NEW] apps/api/app/engine_technicals.py
- Implements the Technical Analysis Engine.
- Fetches historical OHLCV.
- Computes SMA(20,50,200), RSI, MACD, ATR, Bollinger Bands.
- Determines Trend Strength and generates Bullish/Bearish signals.
- Calculates the Technical Score (0-100).

#### [NEW] apps/api/app/engine_quant.py
- Implements the Smart Money Engine.
- Computes Relative Volume (RVOL), Accumulation/Distribution line, Chaikin Money Flow (CMF), VWAP.
- Estimates Breakout Probability based on volatility contraction and volume expansion.
- Generates the Quantitative Score (0-100).

#### [MODIFY] apps/api/app/main.py
- Add REST endpoints: `GET /api/analysis/fundamentals/{symbol}`, `GET /api/analysis/technical/{symbol}`, `GET /api/analysis/smart-money/{symbol}`.
- Each endpoint will support a `?refresh=true` query parameter to force fetching new data.

---

### Frontend UI Redesign & Dashboard Math

We will upgrade the design system to a modern, premium look with vibrant colors, subtle micro-animations, and glassmorphism.

#### [MODIFY] apps/desktop/src/index.css & App.css
- Implement a comprehensive, modern design system.
- Add CSS variables for deep backgrounds, neon accents, and smooth gradients.
- Add hover animations for buttons, table rows, and KPI cards.

#### [MODIFY] apps/desktop/src/pages/DashboardPage.tsx
- Clean up the code and resolve math inconsistencies (e.g., Unrealized PNL, Balance Mismatch).
- Redesign the KPIs layout for better readability.
- Move the "Export/Import Trades" buttons to the bottom of the page.

---

### Frontend New Analysis Tabs

#### [MODIFY] apps/desktop/src/pages/StockFundamentalsPage.tsx
- Create the UI layout: Ticker input, Refresh button, Market Info header.
- Render the Financial Metrics table, Fair Value estimate, and a visual Fundamental Score gauge (Strong Buy -> Avoid).

#### [MODIFY] apps/desktop/src/pages/TechnicalAnalysisPage.tsx
- Integrate a candlestick chart using `react-chartjs-2`.
- Display a Technical Signals panel (Trend, RSI, MACD).
- Render the Technical Score gauge (Strong Bullish -> Strong Bearish).

#### [MODIFY] apps/desktop/src/pages/SmartMoneyPage.tsx
- Display Unusual Volume detection (RVOL).
- Display Accumulation vs. Distribution status.
- Render the Breakout Probability percentage and Quantitative Score.

## Verification Plan

### Automated Tests
- The backend calculations (Fundamental Score, RSI, MACD, RVOL) will be tested via Python scripts by fetching real-world data (e.g., AAPL or MSFT) to ensure the formulas yield accurate, expected results.
- Endpoints will be manually invoked via curl/browser to ensure correct JSON formatting.

### Manual Verification
- You will need to run the application (`npm run dev`) and test searching for a symbol in each of the three new tabs.
- You should verify that the Dashboard math matches your expectations when adding a deposit or evaluating trade PnL.
- You can test exporting and importing a CSV of trades to ensure the feature functions correctly.

-----


review the math in dashboard and protfolio
the content isnt consitance
account should have delete and edit and save in settings
failed to add accounts 
pie chart data is wrong 
redesign the math
manual test Analysis tab for wrong and mistakes