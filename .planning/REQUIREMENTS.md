# Requirements: RichBlue Trading Journal

**Defined:** 2026-06-03
**Core Value:** Traders can log every trade with context and get actionable insights from their history without sending data to any cloud service.

## v1 Requirements

Existing validated features form the v1 baseline. New development targets are:

### Testing & Quality

- [ ] **TEST-01**: All existing API endpoints have integration tests via FastAPI TestClient
- [ ] **TEST-02**: All calculator functions (Kelly, Risk of Ruin, Position Sizer) have unit tests
- [ ] **TEST-03**: EGX scraper has tests against known symbol patterns
- [ ] **TEST-04**: Test suite runs via a single `pytest` command from project root

### Theme & UI

- [ ] **T2D-01**: Theme2 dark variant is implemented as a toggleable CSS theme
- [ ] **T2D-02**: Theme2 color palette and layout mockup is faithfully reproduced
- [ ] **T2D-03**: Theme choice persists across app restarts
- [ ] **T2D-04**: Dashboard page has an "All Time" date range option (currently limited to 1Y)

### Infrastructure

- [ ] **CI-01**: PRs run lint + typecheck + pytest automatically
- [ ] **CI-02**: Build pipeline is verified in CI (not just local build.ps1)
- [ ] **DATA-01**: Settings → Data Management backup creates a timestamped .db copy
- [ ] **DATA-02**: Settings → Data Management restore works from a selected backup file
- [ ] **DATA-03**: Data wipe is confirmed via modal before executing

### AI Coach

- [ ] **AI-01**: AI Coach analyzes trade patterns using the local trade data
- [ ] **AI-02**: AI Coach generates natural-language trade review summaries
- [ ] **AI-03**: Psychology insights correlate emotion states with performance metrics

### Documentation

- [ ] **DOC-01**: Every API endpoint has OpenAPI summary/description (visible in /docs)
- [ ] **DOC-02**: Frontend components in src/components/ have brief inline comments
- [ ] **DOC-03**: README.md includes setup instructions (currently missing in desktop/ package)

## v2 Requirements

### Features

- **CALC-01**: Add Monte Carlo simulation to trading calculators
- **CALC-02**: Add correlation matrix to portfolio page
- **SCRAPE-01**: Support additional international exchanges beyond EGX
- **CHART-01**: Add TradingView-like chart widget for symbol analysis
- **NOTF-01**: Trade reminders or review prompts on app open

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud sync / multi-user | Local-first by design; no server infrastructure |
| Broker API auto-fill | Regulatory complexity; manual entry is deliberate for review discipline |
| Mobile app | Desktop-only Electron app; native file access needed |
| Real-time streaming | On-demand pull scraping is sufficient; streaming adds complexity |
| Authentication | Single-user desktop app; no login needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 1 | Pending |
| TEST-03 | Phase 1 | Pending |
| TEST-04 | Phase 1 | Pending |
| T2D-01 | Phase 2 | Pending |
| T2D-02 | Phase 2 | Pending |
| T2D-03 | Phase 2 | Pending |
| T2D-04 | Phase 2 | Pending |
| CI-01 | Phase 3 | Pending |
| CI-02 | Phase 3 | Pending |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| AI-01 | Phase 4 | Pending |
| AI-02 | Phase 4 | Pending |
| AI-03 | Phase 4 | Pending |
| DOC-01 | Phase 4 | Pending |
| DOC-02 | Phase 4 | Pending |
| DOC-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-03*
*Last updated: 2026-06-03 after GSD project initialization*
