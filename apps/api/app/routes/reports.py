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
