import sys
from pathlib import Path
from datetime import datetime, timedelta, date

import pytest

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.app import portfolio_math as pm
from apps.api.app.models import TradeType, CashTxType

class SimpleTrade:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class SimpleTx:
    def __init__(self, amount, at, tx_type: CashTxType = CashTxType.deposit):
        self.amount = amount
        self.at = at
        self.tx_type = tx_type


def test_total_return_pct_returns_none_on_zero_net():
    assert pm.total_return_pct(100.0, 0.0) is None


def test_realized_pnl_cumulative_through_counts_only_closed_trades():
    today = datetime.utcnow()
    t1 = SimpleTrade(
        symbol="FOO",
        trade_type=TradeType.long,
        entry_price=10.0,
        exit_price=15.0,
        position_size=1.0,
        fees=0.0,
        exit_fees=0.0,
        entry_date=today - timedelta(days=5),
        exit_date=today - timedelta(days=2),
    )
    t2 = SimpleTrade(
        symbol="BAR",
        trade_type=TradeType.long,
        entry_price=20.0,
        exit_price=25.0,
        position_size=2.0,
        fees=0.0,
        exit_fees=0.0,
        entry_date=today - timedelta(days=3),
        exit_date=today + timedelta(days=1),
    )
    trades = [t1, t2]
    as_of = (today - timedelta(days=1)).date()
    total = pm.realized_pnl_cumulative_through(trades, as_of)
    # only t1 counts: pnl = (15-10)*1 = 5
    assert pytest.approx(total, rel=1e-6) == 5.0


def test_unrealized_and_portfolio_with_unrealized():
    today = datetime.utcnow()
    # open trade
    t1 = SimpleTrade(
        symbol="FOO",
        trade_type=TradeType.long,
        entry_price=10.0,
        exit_price=None,
        position_size=3.0,
        fees=1.0,
        exit_fees=0.0,
        entry_date=today - timedelta(days=4),
        exit_date=None,
    )
    trades = [t1]
    txs = [SimpleTx(amount=100.0, at=today - timedelta(days=10))]
    price_map = {"FOO": 14.0}

    as_of = today.date()
    unreal = pm.unrealized_pnl_cumulative_through(trades, as_of, price_map)
    # entry cost = 10*3 + 1 = 31, market value = 14*3 = 42, unreal = 11
    assert pytest.approx(unreal, rel=1e-6) == 11.0

    pv = pm.portfolio_value_with_unrealized(trades, txs, as_of, price_map)
    # net_deposited = 100
    # realized = 0
    # cost_basis = 31
    # cash = 100 - 31 = 69
    # pv = 69 + 42 = 111.0
    assert pytest.approx(pv, rel=1e-6) == 111.0

def test_portfolio_math_negative_balance():
    today = datetime.utcnow()
    # Deposit $100
    txs = [SimpleTx(amount=100.0, at=today - timedelta(days=10))]
    # Buy $200 of stock. Cash becomes -100.
    t1 = SimpleTrade(
        symbol="BAR",
        trade_type=TradeType.long,
        entry_price=20.0,
        exit_price=None,
        position_size=10.0,
        fees=0.0,
        exit_fees=0.0,
        entry_date=today - timedelta(days=4),
        exit_date=None,
    )
    trades = [t1]
    price_map = {"BAR": 25.0}  # Market value = 250
    as_of = today.date()
    
    pv = pm.portfolio_value_with_unrealized(trades, txs, as_of, price_map)
    # cash = 100 - 200 = -100
    # mv = 250
    # pv = 150
    assert pytest.approx(pv, rel=1e-6) == 150.0

def test_multiple_entries_same_symbol():
    today = datetime.utcnow()
    txs = [SimpleTx(amount=2000.0, at=today - timedelta(days=10))]
    t1 = SimpleTrade(
        symbol="AAPL", trade_type=TradeType.long,
        entry_price=100.0, position_size=2.0, fees=5.0,
        exit_price=None, exit_fees=0.0, entry_date=today - timedelta(days=4), exit_date=None
    )
    t2 = SimpleTrade(
        symbol="AAPL", trade_type=TradeType.long,
        entry_price=110.0, position_size=3.0, fees=5.0,
        exit_price=None, exit_fees=0.0, entry_date=today - timedelta(days=3), exit_date=None
    )
    trades = [t1, t2]
    price_map = {"AAPL": 150.0} # Total 5 shares, Market Value = 750
    
    as_of = today.date()
    pv = pm.portfolio_value_with_unrealized(trades, txs, as_of, price_map)
    # cost_basis = (200 + 5) + (330 + 5) = 540
    # cash = 2000 - 540 = 1460
    # pv = 1460 + 750 = 2210.0
    assert pytest.approx(pv, rel=1e-6) == 2210.0
