# Graph Report - .  (2026-06-03)

## Corpus Check
- 105 files · ~240,369 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 344 nodes · 372 edges · 70 communities (21 shown, 49 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Project Architecture|Project Architecture]]
- [[_COMMUNITY_API Endpoints & Models|API Endpoints & Models]]
- [[_COMMUNITY_API Backend Tools|API Backend Tools]]
- [[_COMMUNITY_Desktop Build & Config|Desktop Build & Config]]
- [[_COMMUNITY_Portfolio Dashboard Charts|Portfolio Dashboard Charts]]
- [[_COMMUNITY_Technology Stack|Technology Stack]]
- [[_COMMUNITY_Performance Analytics|Performance Analytics]]
- [[_COMMUNITY_Trade Screenshots|Trade Screenshots]]
- [[_COMMUNITY_Cash Management UI|Cash Management UI]]
- [[_COMMUNITY_Trade Entry & Strategy|Trade Entry & Strategy]]
- [[_COMMUNITY_Technical Analysis|Technical Analysis]]
- [[_COMMUNITY_Calendar & Day PnL|Calendar & Day PnL]]
- [[_COMMUNITY_Stock Fundamentals|Stock Fundamentals]]
- [[_COMMUNITY_Social Icons|Social Icons]]
- [[_COMMUNITY_AI Coach & Psychology|AI Coach & Psychology]]
- [[_COMMUNITY_Portfolio Overview|Portfolio Overview]]
- [[_COMMUNITY_Trading Calculators|Trading Calculators]]
- [[_COMMUNITY_Settings Page|Settings Page]]
- [[_COMMUNITY_Smart Money & Quant|Smart Money & Quant]]
- [[_COMMUNITY_Symbols Browser|Symbols Browser]]
- [[_COMMUNITY_Theme2 Design Concept|Theme2 Design Concept]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]

## God Nodes (most connected - your core abstractions)
1. `Trading App Overhaul & New Analysis Tabs` - 25 edges
2. `API Backend README` - 25 edges
3. `FastAPI Backend` - 15 edges
4. `Electron + React Frontend` - 13 edges
5. `Dashboard Page` - 12 edges
6. `1. Implementation 5 2026` - 9 edges
7. `Technical Analysis Page` - 9 edges
8. `Fundamentals Engine (fundamentals.py)` - 7 edges
9. `Portfolio Mathematics (portfolio_math.py)` - 7 edges
10. `Trading App Execution Tasks` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Technical Analysis Page` --shows--> `Technical Analysis Page`  [INFERRED]
  media/technical.png → Notes/OLD/implementation_plan.md
- `Trade #8 (missing record)` --instance_of--> `Trades Table (SQLite)`  [INFERRED]
  apps/api/data/trading.db → apps/api/app/models.py
- `Trades Table (SQLite)` --conceptually_related_to--> `Trade Journal Page`  [EXTRACTED]
  apps/api/app/models.py → media/trades.png
- `React Framework Logo` --represents--> `React`  [EXTRACTED]
  apps/desktop/src/assets/react.svg → apps/desktop/README.md
- `Trade Screenshot #5a (JPG)` --associated_with_trade--> `Trade #5 (missing record)`  [INFERRED]
  apps/api/media/screenshots/5_6df3f21897be41f98c171a50622bf97d.jpg → apps/api/data/trading.db

## Communities (70 total, 49 thin omitted)

### Community 0 - "Project Architecture"
Cohesion: 0.08
Nodes (32): KpiCard Component, OverviewSyncBar Component, Sidebar Component, 2026-04-19 Critical Fixes, Web Scrapers (EGX/TradingView/Investing.com/Yahoo), yFinance Data Provider, EGX Symbol .CA Fallback, Electron + React Frontend (+24 more)

### Community 1 - "API Endpoints & Models"
Cohesion: 0.12
Nodes (30): GET /api/analysis/fundamentals/{symbol}, GET /api/analysis/smart-money/{symbol}, GET /api/analysis/technical/{symbol}, Account Model (Real vs Testing), Account Switcher UI, Portfolio Balance Mismatch Bug, CSV Export/Import, Dashboard Portfolio Math (+22 more)

### Community 2 - "API Backend Tools"
Cohesion: 0.12
Nodes (26): API Backend README, APScheduler Background Scheduler, CLI Fundamentals Refresh, EGX Exchange Scraper, Fallback Scraper, Alembic Migrations, Paid API Provider, Testing with pytest (+18 more)

### Community 3 - "Desktop Build & Config"
Cohesion: 0.09
Nodes (25): RichBlue Desktop Application, eslint-plugin-react-dom, eslint-plugin-react-x, ESLint, Favicon (Purple V/TA Brand Mark), favicon.svg, Desktop Hero Image, HMR (Hot Module Replacement) (+17 more)

### Community 4 - "Portfolio Dashboard Charts"
Cohesion: 0.09
Nodes (22): Avg Win Stat, Chart Range Selector, Concentration Horizontal Bars, Portfolio Diversification Section, Asset Mix Doughnut Chart, Equity Curve Line Chart, Free Cash Stat, Portfolio Health Score (+14 more)

### Community 5 - "Technology Stack"
Cohesion: 0.23
Nodes (17): Alembic, Chart.js, ESLint, Electron 37, FastAPI, PyInstaller, Python 3.13, React 19 (+9 more)

### Community 6 - "Performance Analytics"
Cohesion: 0.10
Nodes (20): Avg Risk Reward KPI, Avg Win / Loss KPI, Best Day Card, Best Hour Card, Bottom Strategy Card, By Day of Week Table, By Hour of Day Table, Date Range Picker (+12 more)

### Community 7 - "Trade Screenshots"
Cohesion: 0.12
Nodes (20): DELETE /trades/{trade_id}/screenshot, Trade Screenshot #3 (PNG), Trade Screenshot #5a (JPG), Trade Screenshot #5b (JPG), Trade Screenshot #8 (JPG), Screenshots Media Directory, Trade AAA #3, Trade #5 (missing record) (+12 more)

### Community 8 - "Cash Management UI"
Cohesion: 0.17
Nodes (12): Cash Actions Form, Adjust (+/-) Button, Amount Input Field, Available Cash Balance Card, Date Picker (datetime-local), Deposit Button, Edit / Delete Transaction Actions, Note Input Field (+4 more)

### Community 9 - "Trade Entry & Strategy"
Cohesion: 0.36
Nodes (10): 1. Implementation 5 2026, Add Trades Page, Percentage Calculation, SL/TP Percentage Calculation, Stop Loss, Strategies Duplication Bug, Strategy to Trade Association, Take Profit (+2 more)

### Community 10 - "Technical Analysis"
Cohesion: 0.20
Nodes (10): Analyze Button, Force Refresh Button, Technical Score Gauge (0-100), Bearish Signals Panel, Bullish Signals Panel, Momentum and Volatility Panel, Trend Indicators Panel, Technical Analysis Page (+2 more)

### Community 11 - "Calendar & Day PnL"
Cohesion: 0.22
Nodes (9): Day Details Panel, Daily PnL Display, Day Trade List, Day of Week Headers, Daily PnL Calendar Heatmap, Go to Date Input, Calendar Navigation, Calendar Page (+1 more)

### Community 12 - "Stock Fundamentals"
Cohesion: 0.29
Nodes (7): Analyze Button, Growth & Profitability Panel, KPI Cards (Market Cap, P/E, EPS, D/E), Stock Fundamentals Page, Fundamental Score Badge, Ticker Symbol Input, Valuation Panel

### Community 13 - "Social Icons"
Cohesion: 0.29
Nodes (7): Bluesky Social Icon, Discord Social Icon, Documentation Icon, GitHub Social Icon, Social Icons SVG Sprite, Generic Social/Community Icon, X (Twitter) Social Icon

### Community 14 - "AI Coach & Psychology"
Cohesion: 0.38
Nodes (7): Best / Worst Strategy, Emotion States, Insight Cards, Losses by Hour, AI Coach Page, Psychology Correlation, Strategy Performance Summary

### Community 15 - "Portfolio Overview"
Cohesion: 0.33
Nodes (6): Earnings by Asset Class Doughnut, Portfolio Earnings Cumulative Line Chart, Portfolio KPI Grid, Portfolio Mix Pie Chart, Portfolio Page, Positions by Symbol Table

### Community 16 - "Trading Calculators"
Cohesion: 0.33
Nodes (6): Portfolio Allocation Panel, Kelly Criterion Calculator, Trading Calculators (Risk) Page, Advanced Position Sizer, Risk of Ruin Calculator, Simulate Trade Scenario Modal

### Community 17 - "Settings Page"
Cohesion: 0.33
Nodes (6): Account Management Tab, Data Management Tab (Backup/Restore/Wipe), Display & Scaling Tab, Settings Page, Strategy Setup Tab, Interface Theme Tab

### Community 18 - "Smart Money & Quant"
Cohesion: 0.33
Nodes (6): Flow Analysis Detail Panel, Flow Signal Pill Badge, Smart Money KPI Cards (VWAP, RVOL, CMF, Breakout Prob), Smart Money & Quant Page, Smart Money Score Badge, Smart Money Ticker Input

### Community 19 - "Symbols Browser"
Cohesion: 0.50
Nodes (4): Symbol Search Input, Symbol Statistics Bar, Symbol Trade History Table, Symbols Page

### Community 20 - "Theme2 Design Concept"
Cohesion: 0.50
Nodes (4): Theme2 Color Palette, Theme2 Design Concept, Theme2 Layout Mockup, Theme2 Visual Style Elements

## Ambiguous Edges - Review These
- `xlsxwriter` → `reportlab`  [AMBIGUOUS]
  AGENTS.md · relation: conceptually_related_to

## Knowledge Gaps
- **184 isolated node(s):** `App`, `AccountProvider`, `useAccount`, `KpiCard`, `OverviewSyncBar` (+179 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `xlsxwriter` and `reportlab`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `FastAPI Backend` connect `Project Architecture` to `API Endpoints & Models`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `Fundamentals Engine (fundamentals.py)` connect `API Endpoints & Models` to `Project Architecture`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `App`, `AccountProvider`, `useAccount` to the rest of the system?**
  _184 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Project Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.08021390374331551 - nodes in this community are weakly interconnected._
- **Should `API Endpoints & Models` be split into smaller, more focused modules?**
  _Cohesion score 0.11954022988505747 - nodes in this community are weakly interconnected._
- **Should `API Backend Tools` be split into smaller, more focused modules?**
  _Cohesion score 0.1164021164021164 - nodes in this community are weakly interconnected._