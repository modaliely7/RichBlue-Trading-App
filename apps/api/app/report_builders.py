"""Shared PDF/Excel builders used by the report routers.

The builders in this module are intentionally generic: they accept
plain Python dicts and lists so the per-report routers can compute the
data in their own way (SQL joins, analytics, etc.) and just hand the
results here for rendering. Each builder returns a ``Response`` ready
to stream to the browser.

Five Phase-6 reports reuse this:
    1. Current Valuation
    2. Realized vs Unrealized
    3. Cost vs Market
    4. Tax
    5. Monthly Digest
"""
from __future__ import annotations

import io
from datetime import datetime, UTC
from typing import Any, Iterable, Sequence

from fastapi import Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
import pandas as pd


PDF_MEDIA = "application/pdf"
XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def get_base_styles() -> dict[str, ParagraphStyle]:
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        'ReportTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor("#0ea5e9"),
        spaceAfter=12,
        alignment=1,
    )
    section = ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=16,
        spaceAfter=8,
        borderPadding=5,
        backColor=colors.HexColor("#f1f5f9"),
    )
    return {'title': title, 'section': section, 'styles': styles}


def build_pdf(
    *,
    title: str,
    subtitle: str | None,
    sections: Sequence[dict[str, Any]],
) -> bytes:
    """Compose a PDF with a title block plus N sections.

    Each section is a dict with:
        - heading: str (rendered as a section header)
        - paragraphs: list[str] (intro lines before any table)
        - table: dict with ``columns`` (list[str]) and ``rows`` (list[list[Any]])
        - color_column: optional int (0-based) — P&L-style cell colouring
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    base = get_base_styles()
    elements: list = []

    elements.append(Paragraph(title, base['title']))
    period_str = subtitle or "All time"
    elements.append(Paragraph(f"Period: {period_str}", base['styles']['Normal']))
    elements.append(Paragraph(f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')}", base['styles']['Normal']))
    elements.append(Spacer(1, 14))

    for i, sec in enumerate(sections):
        if i > 0:
            elements.append(Spacer(1, 12))
        if sec.get('heading'):
            elements.append(Paragraph(sec['heading'], base['section']))
        for para in sec.get('paragraphs', []):
            elements.append(Paragraph(para, base['styles']['Normal']))
            elements.append(Spacer(1, 4))

        table = sec.get('table')
        if table and table.get('columns'):
            data: list[list] = [list(table['columns'])]
            for row in table.get('rows', []):
                data.append([_fmt_cell(c) for c in row])
            n_cols = len(table['columns'])
            total_w = 540
            col_w = total_w / max(1, n_cols)
            t = Table(data, colWidths=[col_w] * n_cols, repeatRows=1)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f8fafc")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#64748b")),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            color_col = sec.get('color_column')
            if color_col is not None and color_col < n_cols:
                for ridx, row in enumerate(table.get('rows', []), 1):
                    try:
                        val = float(row[color_col])
                    except (TypeError, ValueError):
                        continue
                    if val > 0:
                        t.setStyle(TableStyle([('TEXTCOLOR', (color_col, ridx), (color_col, ridx), colors.HexColor("#10b981"))]))
                    elif val < 0:
                        t.setStyle(TableStyle([('TEXTCOLOR', (color_col, ridx), (color_col, ridx), colors.HexColor("#f43f5e"))]))
            elements.append(t)

        if sec.get('page_break_after'):
            elements.append(PageBreak())

    doc.build(elements)
    return buf.getvalue()


def build_xlsx(*, sheets: Sequence[dict[str, Any]], filename: str) -> Response:
    """Build an Excel workbook with one or more named sheets.

    Each sheet dict has:
        - name: str (sheet name)
        - columns: list[str]
        - rows: list[list[Any]]
        - empty_message: optional str shown when rows is empty
    """
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        for sheet in sheets:
            name = (sheet.get('name') or 'Sheet')[:31]
            cols = sheet.get('columns') or []
            rows = sheet.get('rows') or []
            if not rows:
                pd.DataFrame([{"Message": sheet.get('empty_message', 'No data for this period')}]).to_excel(
                    writer, index=False, sheet_name=name
                )
                continue
            df = pd.DataFrame(rows, columns=cols)
            df.to_excel(writer, index=False, sheet_name=name)
            ws = writer.sheets[name]
            for i, col in enumerate(df.columns):
                try:
                    max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                except Exception:
                    max_len = len(col) + 2
                ws.set_column(i, i, max_len)

    output.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(output.getvalue(), media_type=XLSX_MEDIA, headers=headers)


def pdf_response(payload: bytes, filename: str) -> Response:
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(payload, media_type=PDF_MEDIA, headers=headers)


def timestamped_filename(prefix: str, ext: str) -> str:
    return f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M')}.{ext}"


def _fmt_cell(c: Any) -> str:
    if c is None:
        return "-"
    if isinstance(c, float):
        if c != c:
            return "-"
        if abs(c) >= 1:
            return f"{c:,.2f}"
        return f"{c:.4f}".rstrip("0").rstrip(".")
    return str(c)


def kpi_grid_pdf(kpis: Iterable[tuple[str, str]]) -> list[list]:
    items = list(kpis)
    if not items:
        return [[Paragraph("—", get_base_styles()['styles']['Normal'])]]
    return [[Paragraph(f"<b>{v}</b><br/><font size=8 color='grey'>{k}</font>", get_base_styles()['styles']['Normal']) for k, v in items]]
