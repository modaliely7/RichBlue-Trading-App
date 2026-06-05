"""Performance report (PDF and Excel) router."""
from __future__ import annotations

import io
from datetime import datetime, UTC

from fastapi import APIRouter, Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas  # noqa: F401  (canvas import side-effect for font registration)
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.orm import selectinload

import pandas as pd

from ..analytics import calc_pnl, calc_return_pct
from ..db import session_scope
from ..models import Trade
from .analytics import performance_analytics


router = APIRouter()


@router.get("/reports/performance.pdf")
def performance_report_pdf(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    analytics = performance_analytics(account_id=account_id, start=start, end=end)
    adv = analytics.get("advanced", {})
    overall = analytics.get("overall", {}) or {}
    closed_trades = analytics.get("closed_trades", 0)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor("#0ea5e9"),
        spaceAfter=12,
        alignment=1,
    )
    section_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=16,
        spaceAfter=8,
        borderPadding=5,
        borderWidth=0,
        backColor=colors.HexColor("#f1f5f9"),
    )
    metric_label_style = ParagraphStyle('MetricLabel', parent=styles['Normal'], fontSize=10, textColor=colors.grey)
    metric_value_style = ParagraphStyle('MetricValue', parent=styles['Normal'], fontSize=12, fontWeight='Bold')

    elements = []

    elements.append(Paragraph("Performance Report", title_style))
    period_str = f"{start or 'All Time'} to {end or 'Present'}"
    elements.append(Paragraph(f"Period: {period_str}", styles['Normal']))
    elements.append(Paragraph(f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}", styles['Normal']))
    elements.append(Spacer(1, 10))

    summary_data = [
        [Paragraph("Portfolio Summary", styles['Heading3']), ""],
        [Paragraph(f"Total Net PnL: {overall.get('total', 0.0):.2f}", styles['Normal']),
         Paragraph(f"Win Rate: {adv.get('win_rate', 0.0):.1f}%", styles['Normal'])],
        [Paragraph(f"Profit Factor: {adv.get('profit_factor', 0.0):.2f}", styles['Normal']),
         Paragraph(f"Total Trades: {closed_trades}", styles['Normal'])],
    ]
    summary_table = Table(summary_data, colWidths=[270, 270])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ('SPAN', (0, 0), (1, 0)),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#e2e8f0")),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))

    kpi_data = [
        [Paragraph("Closed Trades", metric_label_style), Paragraph("Win Rate", metric_label_style), Paragraph("Profit Factor", metric_label_style)],
        [Paragraph(str(closed_trades), metric_value_style), Paragraph(f"{adv.get('win_rate', 0.0):.1f}%", metric_value_style), Paragraph(f"{adv.get('profit_factor', 0.0):.2f}", metric_value_style)],
        [Paragraph("Total Net PnL", metric_label_style), Paragraph("Avg Win", metric_label_style), Paragraph("Avg Loss", metric_label_style)],
        [Paragraph(f"{overall.get('total', 0.0):.2f}", metric_value_style), Paragraph(f"{adv.get('avg_win_amount', 0.0):.2f}", metric_value_style), Paragraph(f"{adv.get('avg_loss_amount', 0.0):.2f}", metric_value_style)],
    ]
    kpi_table = Table(kpi_data, colWidths=[180, 180, 180])
    kpi_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(kpi_table)
    elements.append(Spacer(1, 20))

    elements.append(Paragraph("Performance Highlights", section_style))
    highlights = []
    for h_type in ["by_strategy", "by_market"]:
        data = analytics.get(h_type, [])
        valid = [d for d in data if d.get("count", 0) >= 3]
        if valid:
            valid.sort(key=lambda x: x.get("avg", 0), reverse=True)
            label = "Strategies" if h_type == "by_strategy" else "Markets"
            best = valid[0]
            highlights.append(Paragraph(f"<b>Best {label}:</b> {best.get('key')} ({best.get('count')} trades, Avg PnL: {best.get('avg'):.2f})", styles['Normal']))

    if highlights:
        for h in highlights:
            elements.append(h)
    else:
        elements.append(Paragraph("Not enough data for highlights yet (minimum 3 trades per category).", styles['Italic']))

    elements.append(Spacer(1, 20))

    elements.append(Paragraph("Trade Log", section_style))
    with session_scope() as s:
        def parse_iso_naive(x: str | None) -> datetime | None:
            if not x:
                return None
            try:
                return datetime.fromisoformat(x.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                return None

        s_dt = parse_iso_naive(start)
        e_dt = parse_iso_naive(end)

        stmt = select(Trade).where(Trade.account_id == account_id).options(selectinload(Trade.strategies))
        if s_dt:
            stmt = stmt.where(Trade.entry_date >= s_dt)
        if e_dt:
            stmt = stmt.where(Trade.entry_date <= e_dt)

        stmt = stmt.order_by(Trade.entry_date.desc()).limit(50)
        trades = s.execute(stmt).scalars().all()

        table_data = [["Symbol", "Entry", "Exit", "PnL", "Strategies"]]
        for t in trades:
            pnl = calc_pnl(t)
            pnl_str = f"{pnl:.2f}" if pnl is not None else "-"
            strategies_str = ", ".join([s.name for s in t.strategies])

            row = [
                t.symbol,
                t.entry_date.strftime("%Y-%m-%d"),
                t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "-",
                pnl_str,
                strategies_str,
            ]
            table_data.append(row)

        t = Table(table_data, colWidths=[90, 100, 100, 90, 160])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#64748b")),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))

        for i, row_data in enumerate(table_data[1:], 1):
            try:
                pnl_val = float(row_data[3])
                if pnl_val > 0:
                    t.setStyle(TableStyle([('TEXTCOLOR', (3, i), (3, i), colors.HexColor("#10b981"))]))
                elif pnl_val < 0:
                    t.setStyle(TableStyle([('TEXTCOLOR', (3, i), (3, i), colors.HexColor("#f43f5e"))]))
            except Exception:
                pass

        elements.append(t)

    doc.build(elements)
    buf.seek(0)

    filename = f"trading_report_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(buf.getvalue(), media_type="application/pdf", headers=headers)


@router.get("/reports/performance.xlsx")
def performance_report_excel(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    with session_scope() as s:
        trades = s.execute(
            select(Trade)
            .where(Trade.account_id == account_id)
            .options(selectinload(Trade.strategies))
        ).scalars().all()
        data = []
        for t in trades:
            data.append({
                "ID": t.id,
                "Symbol": t.symbol,
                "Market": t.market.value,
                "Entry Price": t.entry_price,
                "Exit Price": t.exit_price,
                "Size": t.position_size,
                "PnL": calc_pnl(t),
                "Return %": calc_return_pct(t),
                "Entry Date": t.entry_date.strftime("%Y-%m-%d %H:%M"),
                "Exit Date": t.exit_date.strftime("%Y-%m-%d %H:%M") if t.exit_date else "",
                "Fees": (t.fees or 0) + (t.exit_fees or 0),
                "Strategy": ", ".join([s.name for s in t.strategies]),
                "Notes": t.notes,
            })

        df = pd.DataFrame(data)

        if start or end:
            df["Entry Date Dt"] = pd.to_datetime(df["Entry Date"])
            if start:
                s_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).replace(tzinfo=None)
                df = df[df["Entry Date Dt"] >= s_dt]
            if end:
                e_dt = datetime.fromisoformat(end.replace("Z", "+00:00")).replace(tzinfo=None)
                df = df[df["Entry Date Dt"] <= e_dt]
            df = df.drop(columns=["Entry Date Dt"])

        if "Entry Date Dt" in df.columns:
            df = df.drop(columns=["Entry Date Dt"])

        if df.empty:
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                pd.DataFrame([{"Message": "No trades found for this period"}]).to_excel(writer, index=False)
            output.seek(0)
            return Response(
                output.getvalue(),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": 'attachment; filename="report_empty.xlsx"'},
            )

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name='Trades')
            worksheet = writer.sheets['Trades']
            for i, col in enumerate(df.columns):
                column_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                worksheet.set_column(i, i, column_len)

        output.seek(0)
        filename = f"performance_report_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return Response(
            output.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers,
        )


# ===========================================================================
# Phase 6 — Market Data + Reports
# 1. Current Valuation
# 2. Realized vs Unrealized
# 3. Cost vs Market
# 4. Tax
# 5. Monthly Digest
# ===========================================================================

from ..report_builders import (  # noqa: E402  (Phase 6 split)
    build_pdf,
    build_xlsx,
    pdf_response,
    timestamped_filename,
)


def _parse_period(start: str | None, end: str | None) -> tuple[datetime | None, datetime | None]:
    def _p(x: str | None) -> datetime | None:
        if not x:
            return None
        try:
            return datetime.fromisoformat(x.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return None
    return _p(start), _p(end)


# ---- 1. Current Valuation ------------------------------------------------

@router.get("/reports/valuation.pdf")
def valuation_report_pdf(account_id: int = 1) -> Response:
    with session_scope() as s:
        from ..utils import _compute_holdings
        rows = _compute_holdings(s, account_id=account_id)
        rows = [r for r in rows if r.open_quantity and r.open_quantity > 0]

    table_rows = []
    for r in rows:
        table_rows.append([
            r.symbol,
            f"{r.open_quantity:.2f}",
            f"{r.avg_open_cost:.2f}" if r.avg_open_cost is not None else "-",
            f"{r.current_price:.2f}" if r.current_price is not None else "-",
            f"{r.market_value:.2f}" if r.market_value is not None else "-",
            f"{r.open_cost_basis:.2f}",
            f"{r.unrealized_pnl:.2f}" if r.unrealized_pnl is not None else "-",
            f"{r.unrealized_pnl_pct:.2f}%" if r.unrealized_pnl_pct is not None else "-",
        ])

    total_cost = sum((r.open_cost_basis or 0.0) for r in rows)
    total_mv = sum((r.market_value or 0.0) for r in rows)
    total_pnl = total_mv - total_cost
    total_pct = (total_pnl / total_cost * 100.0) if total_cost > 0 else 0.0

    if table_rows:
        table_rows.append([
            "TOTAL", "", "", "",
            f"{total_mv:.2f}", f"{total_cost:.2f}",
            f"{total_pnl:.2f}", f"{total_pct:.2f}%",
        ])

    sections = [{
        'heading': "Open Holdings — Current Market Value",
        'table': {
            'columns': ["Symbol", "Qty", "Avg Cost", "Last Price", "Market Value", "Cost Basis", "Unrealized P&L", "P&L %"],
            'rows': table_rows,
        },
        'color_column': 6,
    }]

    pdf = build_pdf(
        title="Current Valuation",
        subtitle=f"Account #{account_id} — {len(rows)} open positions",
        sections=sections,
    )
    return pdf_response(pdf, timestamped_filename("valuation", "pdf"))


@router.get("/reports/valuation.xlsx")
def valuation_report_excel(account_id: int = 1) -> Response:
    with session_scope() as s:
        from ..utils import _compute_holdings
        rows = _compute_holdings(s, account_id=account_id)
        rows = [r for r in rows if r.open_quantity and r.open_quantity > 0]
        data = [
            {
                "Symbol": r.symbol,
                "Open Quantity": r.open_quantity,
                "Avg Open Cost": r.avg_open_cost,
                "Current Price": r.current_price,
                "Market Value": r.market_value,
                "Cost Basis": r.open_cost_basis,
                "Unrealized P&L": r.unrealized_pnl,
                "Unrealized P&L %": r.unrealized_pnl_pct,
                "Open Trades": r.open_trades,
                "Closed Trades": r.closed_trades,
                "Realized P&L": r.realized_pnl,
            }
            for r in rows
        ]
    return build_xlsx(
        sheets=[{'name': 'Holdings', 'columns': list(data[0].keys()) if data else [
            "Symbol", "Open Quantity", "Avg Open Cost", "Current Price",
            "Market Value", "Cost Basis", "Unrealized P&L", "Unrealized P&L %",
            "Open Trades", "Closed Trades", "Realized P&L",
        ], 'rows': [list(d.values()) for d in data], 'empty_message': "No open positions."}],
        filename=timestamped_filename("valuation", "xlsx"),
    )


# ---- 2. Realized vs Unrealized ------------------------------------------

@router.get("/reports/realized-unrealized.pdf")
def realized_unrealized_pdf(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    s_dt, e_dt = _parse_period(start, end)
    with session_scope() as s:
        from sqlalchemy.orm import selectinload
        closed_q = select(Trade).where(Trade.account_id == account_id, Trade.exit_price.is_not(None)).options(selectinload(Trade.strategies))
        if s_dt:
            closed_q = closed_q.where(Trade.exit_date >= s_dt)
        if e_dt:
            closed_q = closed_q.where(Trade.exit_date <= e_dt)
        closed = s.execute(closed_q).scalars().all()

        closed_rows = []
        for t in closed:
            pnl = calc_pnl(t) or 0.0
            closed_rows.append([
                t.symbol,
                t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "-",
                f"{t.entry_price:.2f}",
                f"{t.exit_price:.2f}" if t.exit_price is not None else "-",
                f"{pnl:.2f}",
            ])

        from ..utils import _compute_holdings
        holdings = _compute_holdings(s, account_id=account_id)
        open_rows = []
        for r in holdings:
            if not r.open_quantity or r.open_quantity <= 0:
                continue
            open_rows.append([
                r.symbol,
                f"{r.open_quantity:.2f}",
                f"{r.avg_open_cost:.2f}" if r.avg_open_cost is not None else "-",
                f"{r.current_price:.2f}" if r.current_price is not None else "-",
                f"{r.unrealized_pnl:.2f}" if r.unrealized_pnl is not None else "-",
            ])

        realized = [calc_pnl(t) or 0.0 for t in closed]
    realized_total = sum(realized) if realized else 0.0
    wins = [p for p in realized if p > 0]
    losses = [p for p in realized if p < 0]
    win_rate = (len(wins) / len(realized) * 100) if realized else 0.0
    unrealized_total = sum((r.unrealized_pnl or 0.0) for r in holdings if r.open_quantity and r.open_quantity > 0)

    summary = (
        f"Closed in period: <b>{len(closed)}</b> trades · Realized P&amp;L: "
        f"<b>{realized_total:.2f}</b> · Win rate: <b>{win_rate:.1f}%</b> &nbsp;&nbsp;|&nbsp;&nbsp; "
        f"Open positions: <b>{len(open_rows)}</b> · Unrealized P&amp;L: <b>{unrealized_total:.2f}</b> &nbsp;&nbsp;|&nbsp;&nbsp; "
        f"<b>Net: {realized_total + unrealized_total:.2f}</b>"
    )

    sections = [
        {'paragraphs': [summary]},
        {
            'heading': "Realized P&L (closed trades in period)",
            'table': {
                'columns': ["Symbol", "Exit Date", "Entry", "Exit", "P&L"],
                'rows': closed_rows,
            },
            'color_column': 4,
        },
        {
            'heading': "Unrealized P&L (open positions)",
            'table': {
                'columns': ["Symbol", "Qty", "Avg Cost", "Last Price", "Unrealized P&L"],
                'rows': open_rows,
            },
            'color_column': 4,
        },
    ]

    pdf = build_pdf(
        title="Realized vs Unrealized",
        subtitle=f"{start or 'All time'} → {end or 'Present'}",
        sections=sections,
    )
    return pdf_response(pdf, timestamped_filename("realized_vs_unrealized", "pdf"))


@router.get("/reports/realized-unrealized.xlsx")
def realized_unrealized_excel(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    s_dt, e_dt = _parse_period(start, end)
    with session_scope() as s:
        from sqlalchemy.orm import selectinload
        closed_q = select(Trade).where(Trade.account_id == account_id, Trade.exit_price.is_not(None)).options(selectinload(Trade.strategies))
        if s_dt:
            closed_q = closed_q.where(Trade.exit_date >= s_dt)
        if e_dt:
            closed_q = closed_q.where(Trade.exit_date <= e_dt)
        closed = s.execute(closed_q).scalars().all()
        closed_data = [
            {
                "Type": "Realized",
                "Symbol": t.symbol,
                "Market": t.market.value,
                "Entry Date": t.entry_date.strftime("%Y-%m-%d"),
                "Exit Date": t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "",
                "Entry Price": t.entry_price,
                "Exit Price": t.exit_price,
                "Size": t.position_size,
                "Fees": (t.fees or 0.0) + (t.exit_fees or 0.0),
                "P&L": calc_pnl(t),
                "Strategy": ", ".join([st.name for st in t.strategies]),
            }
            for t in closed
        ]
        from ..utils import _compute_holdings
        holdings = _compute_holdings(s, account_id=account_id)
        open_data = [
            {
                "Type": "Unrealized",
                "Symbol": h.symbol,
                "Market": "",
                "Entry Date": "",
                "Exit Date": "",
                "Entry Price": h.avg_open_cost,
                "Exit Price": h.current_price,
                "Size": h.open_quantity,
                "Fees": None,
                "P&L": h.unrealized_pnl,
                "Strategy": "",
            }
            for h in holdings if h.open_quantity and h.open_quantity > 0
        ]

    return build_xlsx(
        sheets=[{
            'name': 'Realized vs Unrealized',
            'columns': ["Type", "Symbol", "Market", "Entry Date", "Exit Date", "Entry Price", "Exit Price", "Size", "Fees", "P&L", "Strategy"],
            'rows': [list(d.values()) for d in (closed_data + open_data)],
            'empty_message': "No trades or open positions in this period.",
        }],
        filename=timestamped_filename("realized_vs_unrealized", "xlsx"),
    )


# ---- 3. Cost vs Market ---------------------------------------------------

@router.get("/reports/cost-vs-market.pdf")
def cost_vs_market_pdf(account_id: int = 1) -> Response:
    with session_scope() as s:
        from ..utils import _compute_holdings
        rows = _compute_holdings(s, account_id=account_id)
        rows = [r for r in rows if r.open_quantity and r.open_quantity > 0]

    table_rows = []
    for r in rows:
        delta = (r.unrealized_pnl or 0.0)
        delta_pct = (r.unrealized_pnl_pct or 0.0)
        table_rows.append([
            r.symbol,
            f"{r.open_quantity:.2f}",
            f"{r.avg_open_cost:.2f}" if r.avg_open_cost is not None else "-",
            f"{r.current_price:.2f}" if r.current_price is not None else "-",
            f"{r.open_cost_basis:.2f}",
            f"{r.market_value:.2f}" if r.market_value is not None else "-",
            f"{delta:.2f}",
            f"{delta_pct:.2f}%",
        ])

    total_cost = sum((r.open_cost_basis or 0.0) for r in rows)
    total_mv = sum((r.market_value or 0.0) for r in rows)
    total_delta = total_mv - total_cost
    total_pct = (total_delta / total_cost * 100.0) if total_cost > 0 else 0.0
    if table_rows:
        table_rows.append(["TOTAL", "", "", "", f"{total_cost:.2f}", f"{total_mv:.2f}", f"{total_delta:.2f}", f"{total_pct:.2f}%"])

    sections = [{
        'heading': "Cost Basis vs Current Market Value",
        'paragraphs': [
            f"Open positions: <b>{len(rows)}</b> · Total cost: <b>{total_cost:.2f}</b> · "
            f"Total market value: <b>{total_mv:.2f}</b> · Net P&amp;L: <b>{total_delta:.2f}</b> ({total_pct:.2f}%)"
        ],
        'table': {
            'columns': ["Symbol", "Qty", "Avg Cost", "Last Price", "Cost", "Market", "P&L", "P&L %"],
            'rows': table_rows,
        },
        'color_column': 6,
    }]

    pdf = build_pdf(
        title="Cost vs Market",
        subtitle=f"Account #{account_id} — open positions only",
        sections=sections,
    )
    return pdf_response(pdf, timestamped_filename("cost_vs_market", "pdf"))


@router.get("/reports/cost-vs-market.xlsx")
def cost_vs_market_excel(account_id: int = 1) -> Response:
    with session_scope() as s:
        from ..utils import _compute_holdings
        rows = _compute_holdings(s, account_id=account_id)
        rows = [r for r in rows if r.open_quantity and r.open_quantity > 0]
        data = [
            {
                "Symbol": r.symbol,
                "Quantity": r.open_quantity,
                "Avg Cost": r.avg_open_cost,
                "Current Price": r.current_price,
                "Cost Basis": r.open_cost_basis,
                "Market Value": r.market_value,
                "P&L": r.unrealized_pnl,
                "P&L %": r.unrealized_pnl_pct,
            }
            for r in rows
        ]
    return build_xlsx(
        sheets=[{
            'name': 'Cost vs Market',
            'columns': ["Symbol", "Quantity", "Avg Cost", "Current Price", "Cost Basis", "Market Value", "P&L", "P&L %"],
            'rows': [list(d.values()) for d in data],
            'empty_message': "No open positions to compare.",
        }],
        filename=timestamped_filename("cost_vs_market", "xlsx"),
    )


# ---- 4. Tax --------------------------------------------------------------

@router.get("/reports/tax.pdf")
def tax_report_pdf(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    s_dt, e_dt = _parse_period(start, end)
    with session_scope() as s:
        closed_q = select(Trade).where(Trade.account_id == account_id, Trade.exit_price.is_not(None))
        if s_dt:
            closed_q = closed_q.where(Trade.exit_date >= s_dt)
        if e_dt:
            closed_q = closed_q.where(Trade.exit_date <= e_dt)
        closed = s.execute(closed_q.order_by(Trade.exit_date.asc())).scalars().all()

        rows = []
        monthly: dict[str, dict] = {}
        gross_total = 0.0
        fees_total = 0.0
        net_total = 0.0
        for t in closed:
            pnl = calc_pnl(t) or 0.0
            fees = (t.fees or 0.0) + (t.exit_fees or 0.0)
            gross = pnl + fees
            hold_days = (t.exit_date - t.entry_date).days if t.exit_date and t.entry_date else 0
            month_key = t.exit_date.strftime("%Y-%m") if t.exit_date else "unknown"
            bucket = monthly.setdefault(month_key, {"count": 0, "gross": 0.0, "fees": 0.0, "net": 0.0})
            bucket["count"] += 1
            bucket["gross"] += gross
            bucket["fees"] += fees
            bucket["net"] += pnl

            gross_total += gross
            fees_total += fees
            net_total += pnl

            rows.append([
                t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "-",
                t.symbol,
                t.market.value,
                f"{pnl:.2f}",
                f"{fees:.2f}",
                f"{gross:.2f}",
                f"{hold_days}",
            ])

    sections = [
        {
            'paragraphs': [
                f"Closed trades: <b>{len(closed)}</b> · Gross P&amp;L: <b>{gross_total:.2f}</b> · "
                f"Fees paid: <b>{fees_total:.2f}</b> · <b>Net P&amp;L: {net_total:.2f}</b>"
            ],
        },
        {
            'heading': "Closed Trades",
            'table': {
                'columns': ["Exit Date", "Symbol", "Market", "Net P&L", "Fees", "Gross", "Hold (days)"],
                'rows': rows,
            },
            'color_column': 3,
        },
    ]
    if monthly:
        months_sorted = sorted(monthly.keys(), reverse=True)
        sections.append({
            'heading': "Monthly Summary",
            'table': {
                'columns': ["Month", "Trades", "Gross", "Fees", "Net P&L"],
                'rows': [[m, monthly[m]["count"], f"{monthly[m]['gross']:.2f}", f"{monthly[m]['fees']:.2f}", f"{monthly[m]['net']:.2f}"] for m in months_sorted],
            },
            'color_column': 4,
        })

    pdf = build_pdf(
        title="Tax Report",
        subtitle=f"{start or 'All time'} → {end or 'Present'}",
        sections=sections,
    )
    return pdf_response(pdf, timestamped_filename("tax_report", "pdf"))


@router.get("/reports/tax.xlsx")
def tax_report_excel(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    s_dt, e_dt = _parse_period(start, end)
    with session_scope() as s:
        closed_q = select(Trade).where(Trade.account_id == account_id, Trade.exit_price.is_not(None))
        if s_dt:
            closed_q = closed_q.where(Trade.exit_date >= s_dt)
        if e_dt:
            closed_q = closed_q.where(Trade.exit_date <= e_dt)
        closed = s.execute(closed_q.order_by(Trade.exit_date.asc())).scalars().all()

        rows = []
        monthly: dict[str, dict] = {}
        for t in closed:
            pnl = calc_pnl(t) or 0.0
            fees = (t.fees or 0.0) + (t.exit_fees or 0.0)
            gross = pnl + fees
            hold_days = (t.exit_date - t.entry_date).days if t.exit_date and t.entry_date else 0
            month_key = t.exit_date.strftime("%Y-%m") if t.exit_date else "unknown"
            bucket = monthly.setdefault(month_key, {"count": 0, "gross": 0.0, "fees": 0.0, "net": 0.0})
            bucket["count"] += 1
            bucket["gross"] += gross
            bucket["fees"] += fees
            bucket["net"] += pnl
            rows.append({
                "Exit Date": t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "",
                "Symbol": t.symbol,
                "Market": t.market.value,
                "Entry Date": t.entry_date.strftime("%Y-%m-%d"),
                "Entry Price": t.entry_price,
                "Exit Price": t.exit_price,
                "Size": t.position_size,
                "Gross P&L": gross,
                "Fees": fees,
                "Net P&L": pnl,
                "Holding Days": hold_days,
            })

    monthly_rows = [
        {
            "Month": m,
            "Trades": monthly[m]["count"],
            "Gross P&L": monthly[m]["gross"],
            "Fees": monthly[m]["fees"],
            "Net P&L": monthly[m]["net"],
        }
        for m in sorted(monthly.keys())
    ]

    return build_xlsx(
        sheets=[
            {'name': 'Closed Trades', 'columns': ["Exit Date", "Symbol", "Market", "Entry Date", "Entry Price", "Exit Price", "Size", "Gross P&L", "Fees", "Net P&L", "Holding Days"],
             'rows': [list(d.values()) for d in rows], 'empty_message': "No closed trades in this period."},
            {'name': 'Monthly', 'columns': ["Month", "Trades", "Gross P&L", "Fees", "Net P&L"],
             'rows': [list(d.values()) for d in monthly_rows], 'empty_message': "No closed trades in this period."},
        ],
        filename=timestamped_filename("tax_report", "xlsx"),
    )


# ---- 5. Monthly Digest ---------------------------------------------------

@router.get("/reports/monthly-digest.pdf")
def monthly_digest_pdf(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    s_dt, e_dt = _parse_period(start, end)
    with session_scope() as s:
        from sqlalchemy.orm import selectinload
        closed_q = select(Trade).where(Trade.account_id == account_id, Trade.exit_price.is_not(None)).options(selectinload(Trade.strategies))
        if s_dt:
            closed_q = closed_q.where(Trade.exit_date >= s_dt)
        if e_dt:
            closed_q = closed_q.where(Trade.exit_date <= e_dt)
        closed = s.execute(closed_q).scalars().all()

        by_month: dict[str, list[Trade]] = {}
        for t in closed:
            if not t.exit_date:
                continue
            m = t.exit_date.strftime("%Y-%m")
            by_month.setdefault(m, []).append(t)

        sections: list[dict] = []
        for month_key in sorted(by_month.keys(), reverse=True):
            trades = by_month[month_key]
            pnls = [(t, calc_pnl(t) or 0.0) for t in trades]
            total = sum(p for _, p in pnls)
            wins = [p for _, p in pnls if p > 0]
            losses = [p for _, p in pnls if p < 0]
            win_rate = (len(wins) / len(pnls) * 100) if pnls else 0.0
            fees = sum((t.fees or 0.0) + (t.exit_fees or 0.0) for t in trades)
            best = max(pnls, key=lambda x: x[1]) if pnls else None
            worst = min(pnls, key=lambda x: x[1]) if pnls else None

            strat_pnl: dict[str, float] = {}
            for t, p in pnls:
                for strat in t.strategies:
                    strat_pnl[strat.name] = strat_pnl.get(strat.name, 0.0) + p
            top_strat = max(strat_pnl.items(), key=lambda x: x[1]) if strat_pnl else None

            rows = [[t.symbol, t.entry_date.strftime("%Y-%m-%d"), t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "-",
                     f"{p:.2f}", ", ".join([st.name for st in t.strategies])] for t, p in pnls]

            sections.append({
                'heading': f"{month_key} — {len(trades)} closed trades",
                'paragraphs': [
                    f"Net P&amp;L: <b>{total:.2f}</b> · Win rate: <b>{win_rate:.1f}%</b> ({len(wins)}W / {len(losses)}L) · Fees: <b>{fees:.2f}</b>"
                    + (f" · Best: <b>{best[0].symbol}</b> ({best[1]:.2f})" if best and best[1] > 0 else "")
                    + (f" · Worst: <b>{worst[0].symbol}</b> ({worst[1]:.2f})" if worst and worst[1] < 0 else "")
                    + (f" · Top strategy: <b>{top_strat[0]}</b> ({top_strat[1]:.2f})" if top_strat else ""),
                ],
                'table': {
                    'columns': ["Symbol", "Entry", "Exit", "P&L", "Strategies"],
                    'rows': rows,
                },
                'color_column': 3,
                'page_break_after': True,
            })

        if not sections:
            sections = [{'paragraphs': ["No closed trades in this period."]}]

    pdf = build_pdf(
        title="Monthly Digest",
        subtitle=f"{start or 'All time'} → {end or 'Present'}",
        sections=sections,
    )
    return pdf_response(pdf, timestamped_filename("monthly_digest", "pdf"))


@router.get("/reports/monthly-digest.xlsx")
def monthly_digest_excel(account_id: int = 1, start: str | None = None, end: str | None = None) -> Response:
    s_dt, e_dt = _parse_period(start, end)
    with session_scope() as s:
        from sqlalchemy.orm import selectinload
        closed_q = select(Trade).where(Trade.account_id == account_id, Trade.exit_price.is_not(None)).options(selectinload(Trade.strategies))
        if s_dt:
            closed_q = closed_q.where(Trade.exit_date >= s_dt)
        if e_dt:
            closed_q = closed_q.where(Trade.exit_date <= e_dt)
        closed = s.execute(closed_q).scalars().all()

        monthly_rows: list[dict] = []
        trade_rows: list[dict] = []
        by_month: dict[str, list[Trade]] = {}
        for t in closed:
            if not t.exit_date:
                continue
            m = t.exit_date.strftime("%Y-%m")
            by_month.setdefault(m, []).append(t)

        for month_key in sorted(by_month.keys(), reverse=True):
            trades = by_month[month_key]
            pnls = [(t, calc_pnl(t) or 0.0) for t in trades]
            total = sum(p for _, p in pnls)
            wins = [p for _, p in pnls if p > 0]
            win_rate = (len(wins) / len(pnls) * 100) if pnls else 0.0
            fees = sum((t.fees or 0.0) + (t.exit_fees or 0.0) for t in trades)
            best = max(pnls, key=lambda x: x[1]) if pnls else (None, 0.0)
            worst = min(pnls, key=lambda x: x[1]) if pnls else (None, 0.0)

            monthly_rows.append({
                "Month": month_key,
                "Trades": len(trades),
                "Wins": len(wins),
                "Losses": len(pnls) - len(wins),
                "Win Rate %": win_rate,
                "Net P&L": total,
                "Fees": fees,
                "Best Symbol": best[0].symbol if best[0] else "",
                "Best P&L": best[1] if best[0] else None,
                "Worst Symbol": worst[0].symbol if worst[0] else "",
                "Worst P&L": worst[1] if worst[0] else None,
            })

            for t, p in pnls:
                trade_rows.append({
                    "Month": month_key,
                    "Symbol": t.symbol,
                    "Market": t.market.value,
                    "Entry Date": t.entry_date.strftime("%Y-%m-%d"),
                    "Exit Date": t.exit_date.strftime("%Y-%m-%d") if t.exit_date else "",
                    "P&L": p,
                    "Fees": (t.fees or 0.0) + (t.exit_fees or 0.0),
                    "Strategy": ", ".join([st.name for st in t.strategies]),
                })

    return build_xlsx(
        sheets=[
            {'name': 'Monthly Summary', 'columns': ["Month", "Trades", "Wins", "Losses", "Win Rate %", "Net P&L", "Fees", "Best Symbol", "Best P&L", "Worst Symbol", "Worst P&L"],
             'rows': [list(d.values()) for d in monthly_rows], 'empty_message': "No closed trades in this period."},
            {'name': 'Trades', 'columns': ["Month", "Symbol", "Market", "Entry Date", "Exit Date", "P&L", "Fees", "Strategy"],
             'rows': [list(d.values()) for d in trade_rows], 'empty_message': "No closed trades in this period."},
        ],
        filename=timestamped_filename("monthly_digest", "xlsx"),
    )
