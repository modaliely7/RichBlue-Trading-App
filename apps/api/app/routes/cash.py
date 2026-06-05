"""Cash, deposit, withdraw, adjust, dividend, and transactions router."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..db import session_scope
from ..models import CashTransaction, CashTxType, Trade
from ..schemas import (
    CashAdjustRequest,
    CashBalanceResponse,
    CashDepositRequest,
    CashTxRead,
    CashWithdrawRequest,
    DividendRequest,
)
from ..utils import _add_cash_tx, _cash_balance, to_cash_tx_read


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/cash/balance", response_model=CashBalanceResponse)
def cash_balance(account_id: int = 1) -> CashBalanceResponse:
    with session_scope() as s:
        return CashBalanceResponse(balance=_cash_balance(s, account_id))


@router.get("/cash/transactions", response_model=list[CashTxRead])
def cash_transactions(account_id: int = 1, limit: int = 300, offset: int = 0) -> list[CashTxRead]:
    with session_scope() as s:
        rows = (
            s.execute(
                select(CashTransaction)
                .where(CashTransaction.account_id == account_id)
                .order_by(CashTransaction.at.desc())
                .limit(limit)
                .offset(offset)
            )
            .scalars()
            .all()
        )
        return [to_cash_tx_read(r) for r in rows]


@router.post("/cash/deposit")
def cash_deposit(payload: CashDepositRequest, account_id: int = 1) -> dict:
    """Accept a deposit and return the new balance plus created transaction id.

    This endpoint is intentionally tolerant and returns a helpful payload for the UI.
    """
    try:
        with session_scope() as s:
            try:
                amt = float(payload.amount)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid amount")
            if amt <= 0:
                raise HTTPException(status_code=400, detail="Amount must be greater than zero")

            logger.info("Attempting deposit for account %s: %s", account_id, payload)
            tx = _add_cash_tx(s, account_id=account_id, amount=amt, tx_type=CashTxType.deposit, at=payload.at, note=payload.note)
            s.flush()
            bal = _cash_balance(s, account_id)
            logger.info("Deposit successful: tx_id=%s amount=%s new_balance=%s", getattr(tx, 'id', None), amt, bal)
            return {"balance": bal, "tx_id": getattr(tx, 'id', None)}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error processing deposit: %s", e)
        raise HTTPException(status_code=500, detail=f"Deposit failed: {e}")


@router.post("/cash/withdraw", response_model=CashBalanceResponse)
def cash_withdraw(payload: CashWithdrawRequest, account_id: int = 1) -> CashBalanceResponse:
    with session_scope() as s:
        bal = _cash_balance(s, account_id)
        if payload.amount > bal + 1e-9:
            raise HTTPException(status_code=400, detail=f"Insufficient cash (Available: {bal:.2f}).")
        _add_cash_tx(s, account_id=account_id, amount=-payload.amount, tx_type=CashTxType.withdraw, at=payload.at, note=payload.note)
        s.flush()
        return CashBalanceResponse(balance=_cash_balance(s, account_id))


@router.post("/cash/adjust", response_model=CashBalanceResponse)
def cash_adjust(payload: CashAdjustRequest, account_id: int = 1) -> CashBalanceResponse:
    with session_scope() as s:
        _add_cash_tx(s, account_id=account_id, amount=payload.amount, tx_type=CashTxType.adjustment, at=payload.at, note=payload.note)
        s.flush()
        return CashBalanceResponse(balance=_cash_balance(s, account_id))


@router.delete("/cash/transactions/{tx_id}")
def delete_cash_transaction(tx_id: int) -> dict:
    with session_scope() as s:
        tx = s.get(CashTransaction, tx_id)
        if not tx:
            raise HTTPException(status_code=404, detail="Cash transaction not found")
        if tx.tx_type in (CashTxType.trade_buy, CashTxType.trade_sell, CashTxType.fee):
            raise HTTPException(status_code=400, detail="Cannot delete trade-linked cash transaction directly. Please edit the trade instead.")
        s.delete(tx)
        return {"deleted": True}


@router.put("/cash/transactions/{tx_id}", response_model=CashTxRead)
def update_cash_transaction(tx_id: int, payload: CashAdjustRequest) -> CashTxRead:
    with session_scope() as s:
        tx = s.get(CashTransaction, tx_id)
        if not tx:
            raise HTTPException(status_code=404, detail="Cash transaction not found")
        if tx.tx_type in (CashTxType.trade_buy, CashTxType.trade_sell, CashTxType.fee):
            raise HTTPException(status_code=400, detail="Cannot edit trade-linked cash transaction directly. Please edit the trade instead.")

        tx.amount = payload.amount
        if payload.at is not None:
            tx.at = payload.at
        if payload.note is not None:
            tx.note = payload.note

        s.commit()
        s.refresh(tx)
        return to_cash_tx_read(tx)


@router.post("/cash/dividend")
def record_dividend(payload: DividendRequest, account_id: int = 1):
    from datetime import datetime, UTC
    with session_scope() as s:
        trade = None
        if payload.trade_id:
            trade = s.execute(
                select(Trade).where(Trade.id == payload.trade_id, Trade.account_id == account_id)
            ).scalars().first()
            if not trade:
                raise HTTPException(status_code=404, detail="Trade not found")

        amount_val = payload.amount
        if payload.is_stock_dividend:
            if not trade:
                raise HTTPException(status_code=400, detail="Stock dividend requires a linked trade")
            trade.position_size += payload.amount
            amount_val = 0.0
            note = payload.note or f"Stock Dividend ({payload.amount} shares) for {payload.symbol}"
        else:
            note = payload.note or f"Cash Dividend for {payload.symbol}"

        tx = CashTransaction(
            account_id=account_id,
            amount=amount_val,
            tx_type=CashTxType.dividend,
            symbol=payload.symbol.strip().upper(),
            trade_id=payload.trade_id,
            at=payload.at or datetime.now(UTC),
            note=note,
        )
        s.add(tx)
        return {"status": "success", "new_size": trade.position_size if trade else None}
