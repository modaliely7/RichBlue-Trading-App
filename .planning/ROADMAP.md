# Roadmap: RichBlue Trading Journal

## Overview

From existing codebase to well-tested, themed, documented, and infrastructure-hardened application. Phase 1 addresses the critical test-coverage gap. Phase 2 delivers the Theme2 design system. Phase 3 adds CI/CD and data management. Phase 4 enhances the AI Coach and fills documentation gaps.

## Phases

- [ ] **Phase 1: Test Coverage Foundation** - Build a robust test suite for API endpoints, calculators, and scrapers
- [ ] **Phase 2: Theme2 Design System** - Implement the dark theme variant with new color palette and layout
- [ ] **Phase 3: Infrastructure & Data Safety** - CI/CD pipeline, backup/restore, and data management hardening
- [ ] **Phase 4: AI Coach & Documentation** - LLM-powered trade reviews, psychology insights, and full API/component docs

## Phase Details

### Phase 1: Test Coverage Foundation
**Goal**: Expand from 6 test files to comprehensive coverage of API endpoints, calculators, and scrapers
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. All trade/cash/analysis endpoints have tests passing with FastAPI TestClient
  2. Kelly, Risk of Ruin, and Position Sizer have isolated unit tests
  3. EGX scraper tests cover .CA suffixes, fallback behavior, and error cases
  4. A single `pytest` command from project root runs all tests with 0 failures
**Plans**: 3 plans

Plans:
- [ ] 01-01: Backend endpoint tests (trades, cash, analysis, portfolio)
- [ ] 01-02: Calculator and scraper unit tests
- [ ] 01-03: Test runner setup (pytest config, conftest fixtures, CI-ready)

### Phase 2: Theme2 Design System
**Goal**: Implement the Theme2 dark variant design concept as a toggleable CSS theme
**Depends on**: Phase 1
**Requirements**: T2D-01, T2D-02, T2D-03, T2D-04
**Success Criteria** (what must be TRUE):
  1. Theme2 color palette and layout from mockup is faithfully rendered in-app
  2. User can toggle between current theme and Theme2 in Settings
  3. Theme choice persists across app restart (stored in localStorage or DB)
  4. Dashboard "All Time" date range is available alongside 1M/3M/6M/1Y
**Plans**: 2 plans

Plans:
- [ ] 02-01: Theme2 CSS variables, global styles, and Settings toggle
- [ ] 02-02: Dashboard "All Time" date range and theme persistence

### Phase 3: Infrastructure & Data Safety
**Goal**: CI/CD pipeline for automated quality gates and working data backup/restore
**Depends on**: Phase 1 (tests needed for CI)
**Requirements**: CI-01, CI-02, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. GitHub Actions (or equivalent) runs lint, typecheck, and pytest on every PR
  2. Build pipeline is verified in CI (not just local build.ps1)
  3. Backup creates a timestamped .db copy from Settings
  4. Restore loads a selected backup with confirmation
  5. Data wipe shows a confirmation modal before executing
**Plans**: 2 plans

Plans:
- [ ] 03-01: CI/CD pipeline (GitHub Actions workflow)
- [ ] 03-02: Backup/restore/wipe data management implementation

### Phase 4: AI Coach & Documentation
**Goal**: Enhance AI Coach with LLM-powered insights and fill documentation gaps
**Depends on**: Phase 2
**Requirements**: AI-01, AI-02, AI-03, DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):
  1. AI Coach generates natural-language trade review summaries from local data
  2. Psychology insights correlate emotion states with performance metrics
  3. Every API endpoint has OpenAPI description visible in /docs
  4. Frontend components in src/components/ have brief doc comments
  5. README.md includes full setup instructions for both api/ and desktop/
**Plans**: 2 plans

Plans:
- [ ] 04-01: AI Coach LLM integration and psychology correlation
- [ ] 04-02: API docs, component docs, and README update

## Progress

**Execution Order:** 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Test Coverage Foundation | 0/3 | Not started | - |
| 2. Theme2 Design System | 0/2 | Not started | - |
| 3. Infrastructure & Data Safety | 0/2 | Not started | - |
| 4. AI Coach & Documentation | 0/2 | Not started | - |
