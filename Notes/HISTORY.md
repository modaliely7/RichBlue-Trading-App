## 🔥 Critical Fixes Timeline

### [2026-04-19]
**Agent Role:** QA / UI / Finance
**Files Affected:**
- `apps/desktop/src/index.css`
- `apps/api/app/portfolio_math.py`
- `apps/api/app/data_providers.py`
- `apps/api/tests/test_portfolio_math.py`

**Changes Made:**
- Extracted and applied 'MedGPT' neo-brutalism design tokens as a switchable theme (`data-theme="medgpt"`).
- Refactored `portfolio_value_with_unrealized` to calculate equity strictly as `cash + market_value`.
- Fixed `unrealized_pnl` and `cost_basis` to account for entry fees, preventing calculation mismatch.
- Added fallback `.CA` symbol logic in `data_providers.py` for Egyptian stocks (`EGAL`, `TMGH`, `ARCC`).
- Created extensive test coverage for `portfolio_math` covering partial closes, negative balances, and multiple entries.

**Reason:**
- The frontend theme needed an extreme high-contrast neo-brutalism aesthetic update.
- Portfolio value did not algebraically match `cash + market_value` due to missing cost_basis subtractions.
- Egyptian symbols lacked `.CA` extensions, failing `yfinance` fetches.
- Ensure regression protection for complex edge cases (negative balances).

**Before:**
- `portfolio_value` summed `net_deposited + realized + unrealized` without explicitly computing true cash available.
- Missing Egyptian stocks returned API failures.

**After:**
- True transparent cash accounting (`cash = ledger + realized - cost_basis`).
- Egyptian stocks fallback to `.CA` gracefully.
- The UI can instantly toggle the MedGPT theme via `data-theme`.

**Impact:**
- Perfect accuracy on PnL vs Ledger. Highly striking UI option. Stable Egyptian stock data fetches.

## 🧮 PnL Fixes
## 🎨 UI Changes
## 🧪 Test Coverage Improvements