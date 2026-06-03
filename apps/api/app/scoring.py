from datetime import datetime
from sqlalchemy import select, func
from .models import Trade, StockScore, Market
from .analytics import calc_pnl

def update_stock_score(session, symbol: str):
    """Calculate and persist the StockScore for a given symbol based on trade history."""
    sym = symbol.strip().upper()
    
    # Fetch all closed trades for this symbol
    trades = session.execute(
        select(Trade).where(Trade.symbol == sym, Trade.exit_price.is_not(None))
    ).scalars().all()
    
    count = len(trades)
    if count == 0:
        # If no trades, we might still want to create a placeholder or update market metrics
        # For now, let's just return
        return
    
    wins = 0
    total_pnl = 0.0
    
    for t in trades:
        pnl = calc_pnl(t) or 0.0
        total_pnl += float(pnl)
        if pnl > 0:
            wins += 1
            
    win_rate = (wins / count) * 100.0 if count > 0 else 0.0
    
    # Basic scoring logic:
    # 50 base + (win_rate * 0.3) + (normalized_pnl * 0.2)
    # This is a placeholder, can be refined.
    # We want a score between 0 and 100.
    
    # Heuristic for PnL impact: 10 points for every 1000 in PnL, max 20.
    pnl_bonus = min(20, (total_pnl / 1000.0) * 10) if total_pnl > 0 else max(-20, (total_pnl / 1000.0) * 10)
    
    raw_score = 50 + (win_rate * 0.3) + pnl_bonus
    final_score = max(0, min(100, raw_score))
    
    # Update or Create
    score_obj = session.get(StockScore, sym)
    if not score_obj:
        score_obj = StockScore(symbol=sym)
        session.add(score_obj)
        
    score_obj.score = final_score
    score_obj.personal_win_rate = win_rate
    score_obj.personal_total_pnl = total_pnl
    score_obj.personal_trade_count = count
    score_obj.last_updated = datetime.utcnow()
    
    session.flush()
