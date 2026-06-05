"""Curated list of EGX-listed stocks.

The Egyptian Exchange (EGX) does not publish a single canonical API; the
public EGX site is a static-rendered HTML list. To avoid scraping on every
startup, this module ships a curated catalog of the most-traded EGX stocks
and is used as the seed for the ``symbols`` table.

Yahoo Finance's free public endpoint serves EGX prices with the ``.CA``
suffix (despite the suffix being associated with Canada — the Egyptian
listing of any given ticker on Yahoo is at ``{TICKER}.CA``). This was
verified end-to-end against the Borsa open-source library
(https://github.com/7ashraf/borsa) and via direct yfinance calls.

Sources used to assemble this list:
  * honest-eg.com (live EGX30/EGX70 constituents, Sep 2025 snapshot)
  * Borsa ``egx_standalone.py`` (English names, 15 canonical tickers)
  * investing.com EGX30 components page
  * stockanalysis.com/list/egyptian-stock-exchange/ (223 listed names)

When new symbols are added on the EGX, run ``POST /market-data/refresh-symbols``
to re-seed this list (the endpoint upserts rows whose canonical matches
this catalog into the ``symbols`` table; the catalog itself is read-only
at runtime).
"""
from __future__ import annotations

from typing import TypedDict


class EgxStock(TypedDict):
    canonical: str
    name_en: str
    name_ar: str
    sector: str


# Each row is the canonical EGX ticker (uppercase, no exchange suffix).
# ``name_en`` is the short English name; ``name_ar`` is the official Arabic
# transliteration (rendered in Arabic script for native RTL display).
# ``sector`` is a coarse bucket; fine-grained classification lives in
# the user's account-level ``Strategy`` rows.
EGX_STOCKS: list[EgxStock] = [
    {"canonical": "COMI", "name_en": "Commercial International Bank (CIB)", "name_ar": "البنك التجاري الدولي", "sector": "Banks"},
    {"canonical": "HRHO", "name_en": "EFG Hermes Holding", "name_ar": "إي إف جي هيرميس القابضة", "sector": "Financial Services"},
    {"canonical": "EAST", "name_en": "Eastern Tobacco", "name_ar": "الشرقية للدخان", "sector": "Tobacco"},
    {"canonical": "SWDY", "name_en": "El Sewedy Electric", "name_ar": "السويدي إليكتريك", "sector": "Industrials"},
    {"canonical": "ESRS", "name_en": "Ezz Steel", "name_ar": "حديد عز", "sector": "Steel"},
    {"canonical": "AMOC", "name_en": "Alexandria Mineral Oils", "name_ar": "الإسكندرية للزيوت المعدنية", "sector": "Energy"},
    {"canonical": "ETEL", "name_en": "Telecom Egypt", "name_ar": "المصرية للاتصالات", "sector": "Telecom"},
    {"canonical": "JUFO", "name_en": "Juhayna Food Industries", "name_ar": "جهينة للصناعات الغذائية", "sector": "Food"},
    {"canonical": "SKPC", "name_en": "Sidi Kerir Petrochemicals (SIDPEC)", "name_ar": "سيدي كرير للبتروكيماويات", "sector": "Petrochemicals"},
    {"canonical": "ORWE", "name_en": "Oriental Weavers", "name_ar": "النساجون الشرقيون", "sector": "Textiles"},
    {"canonical": "CIEB", "name_en": "Credit Agricole Egypt", "name_ar": "بنك كريدي أجريكول مصر", "sector": "Banks"},
    {"canonical": "HDBK", "name_en": "Housing & Development Bank", "name_ar": "بنك التعمير والإسكان", "sector": "Banks"},
    {"canonical": "EMFD", "name_en": "Emaar Misr for Development", "name_ar": "إعمار مصر للتنمية", "sector": "Real Estate"},
    {"canonical": "ORAS", "name_en": "Orascom Construction", "name_ar": "أوراسكوم كونستراكشون", "sector": "Construction"},
    {"canonical": "PHDC", "name_en": "Palm Hills Developments", "name_ar": "بالم هيلز للتعمير", "sector": "Real Estate"},
    {"canonical": "TMGH", "name_en": "TMG Holding", "name_ar": "مجموعة طلعت مصطفى القابضة", "sector": "Real Estate"},
    {"canonical": "MNHD", "name_en": "Madinet Nasr Housing", "name_ar": "مدينة نصر للإسكان والتعمير", "sector": "Real Estate"},
    {"canonical": "EFID", "name_en": "Edita Food Industries", "name_ar": "إديتا للصناعات الغذائية", "sector": "Food"},
    {"canonical": "IRON", "name_en": "Egyptian Iron & Steel", "name_ar": "الحديد والصلب المصرية", "sector": "Steel"},
    {"canonical": "SIPC", "name_en": "Sabaa International", "name_ar": "سبأ الدولية", "sector": "Pharma"},
    {"canonical": "EKHO", "name_en": "Egypt Kuwait Holding", "name_ar": "المصرية الكويتية القابضة", "sector": "Diversified Holdings"},
    {"canonical": "MFPC", "name_en": "Misr Fertilizers Production (MOPCO)", "name_ar": "مصر لإنتاج الأسمدة", "sector": "Petrochemicals"},
    {"canonical": "BTFH", "name_en": "Beltone Financial Holding", "name_ar": "بلتون المالية القابضة", "sector": "Financial Services"},
    {"canonical": "ABUK", "name_en": "Abu Qir Fertilizers", "name_ar": "أبو قير للأسمدة", "sector": "Petrochemicals"},
    {"canonical": "ADIB", "name_en": "Abu Dhabi Islamic Bank - Egypt", "name_ar": "مصرف أبوظبي الإسلامي - مصر", "sector": "Banks"},
    {"canonical": "FWRY", "name_en": "Fawry for Banking Technology", "name_ar": "فوري لتكنولوجيا البنوك", "sector": "Financial Services"},
    {"canonical": "EFIH", "name_en": "e-Finance for Digital Investments", "name_ar": "إي فاينانس للاستثمارات الرقمية", "sector": "Financial Services"},
    {"canonical": "QNBE", "name_en": "Qatar National Bank Alahli", "name_ar": "بنك قطر الوطني الأهلي", "sector": "Banks"},
    {"canonical": "EGAL", "name_en": "Egypt Aluminum", "name_ar": "مصر للألومنيوم", "sector": "Steel"},
    {"canonical": "CLHO", "name_en": "Cleopatra Hospitals", "name_ar": "مستشفيات كليوباترا", "sector": "Healthcare"},
    {"canonical": "AUTO", "name_en": "GB Corp (GB Auto)", "name_ar": "جي بي كورب", "sector": "Automotive"},
    {"canonical": "MCQE", "name_en": "Misr Cement (Qena)", "name_ar": "مصر للأسمنت (قنا)", "sector": "Cement"},
    {"canonical": "ARCC", "name_en": "Arabian Cement", "name_ar": "الأسمنت العربية", "sector": "Cement"},
    {"canonical": "CCAP", "name_en": "Qalaa Holdings", "name_ar": "القلعة القابضة", "sector": "Diversified Holdings"},
    {"canonical": "KIMA", "name_en": "Egyptian Chemical Industries (Kima)", "name_ar": "الكيماويات المصرية", "sector": "Chemicals"},
    {"canonical": "ORHT", "name_en": "Orascom Hotels", "name_ar": "أوراسكوم للفنادق", "sector": "Hotels"},
    {"canonical": "ISPH", "name_en": "Ibnsina Pharma", "name_ar": "ابن سينا فارما", "sector": "Pharma"},
    {"canonical": "EXPA", "name_en": "Export Development Bank of Egypt", "name_ar": "البنك المصري لتنمية الصادرات", "sector": "Banks"},
    {"canonical": "ATQA", "name_en": "Egyptian Steel - Ataqa", "name_ar": "مصر الوطنية للصلب - عتاقة", "sector": "Steel"},
    {"canonical": "EGCH", "name_en": "Egyptian Chemical Industries (EGCH)", "name_ar": "الصناعات الكيماوية المصرية", "sector": "Chemicals"},
    {"canonical": "CANA", "name_en": "Suez Canal Bank", "name_ar": "بنك قناة السويس", "sector": "Banks"},
    {"canonical": "BQDC", "name_en": "Bank of Cairo", "name_ar": "بنك القاهرة", "sector": "Banks"},
    {"canonical": "PHGC", "name_en": "Premier Health Group", "name_ar": "بريميم هيلثكير جروب", "sector": "Healthcare"},
    {"canonical": "RMDA", "name_en": "Rameda Pharmaceutical", "name_ar": "العاشر من رمضان للصناعات الدوائية", "sector": "Pharma"},
    {"canonical": "HELI", "name_en": "Heliopolis Housing & Development", "name_ar": "مصر الجديدة للإسكان والتعمير", "sector": "Real Estate"},
    {"canonical": "PHAR", "name_en": "EIPICO (Egyptian Int. Pharma)", "name_ar": "المصرية الدولية للصناعات الدوائية", "sector": "Pharma"},
    {"canonical": "SPMD", "name_en": "Speed Medical", "name_ar": "سبيد ميديكال", "sector": "Healthcare"},
    {"canonical": "NINH", "name_en": "Nile International Hospital", "name_ar": "مستشفى النزهة الدولي", "sector": "Healthcare"},
    {"canonical": "MEPA", "name_en": "Medical Packaging", "name_ar": "العبوات الطبية", "sector": "Healthcare"},
    {"canonical": "MCRO", "name_en": "Macro Group Pharmaceuticals", "name_ar": "ماكرو جروب للمستحضرات الطبية", "sector": "Pharma"},
    {"canonical": "FERC", "name_en": "Ferchem Egypt for Fertilizers", "name_ar": "فيركيم مصر للأسمدة", "sector": "Chemicals"},
    {"canonical": "KASABF", "name_en": "Oudn Equity Fund - Kasab", "name_ar": "صندوق أودن للأسهم المصرية - كسب", "sector": "Funds"},
    {"canonical": "EGREF", "name_en": "Egyptians Real Estate Fund", "name_ar": "المصريين للاستثمار العقاري", "sector": "Funds"},
    {"canonical": "EGX30ETF", "name_en": "EGX 30 Index ETF", "name_ar": "صندوق المؤشرات EGX 30", "sector": "Funds"},
    {"canonical": "SAUD", "name_en": "Al Baraka Bank Egypt", "name_ar": "بنك البركة مصر", "sector": "Banks"},
    {"canonical": "FAIT", "name_en": "Faisal Islamic Bank of Egypt (EGP)", "name_ar": "بنك فيصل الإسلامي المصري", "sector": "Banks"},
    {"canonical": "FAITA", "name_en": "Faisal Islamic Bank of Egypt (USD)", "name_ar": "بنك فيصل الإسلامي بالدولار", "sector": "Banks"},
    {"canonical": "UBEE", "name_en": "The United Bank of Egypt", "name_ar": "المصرف المتحد", "sector": "Banks"},
    {"canonical": "EGBE", "name_en": "Egyptian Gulf Bank", "name_ar": "البنك المصري الخليجي", "sector": "Banks"},
    {"canonical": "EFIC", "name_en": "Egyptian Financial & Industrial", "name_ar": "المالية والصناعية المصرية", "sector": "Diversified Holdings"},
    {"canonical": "ICMI", "name_en": "International Co. for Medical Industries", "name_ar": "الدولية للصناعات الطبية - إيكمي", "sector": "Healthcare"},
    {"canonical": "ISMQ", "name_en": "Egyptian Iron & Steel Quarries", "name_ar": "الحديد والصلب للمناجم والمحاجر", "sector": "Mining"},
    {"canonical": "BIOC", "name_en": "Glaxo SmithKline Egypt", "name_ar": "جلاكسو سميثكلاين", "sector": "Pharma"},
    {"canonical": "KZPC", "name_en": "Kafr El Zayat Pesticides", "name_ar": "كفر الزيات للمبيدات والكيماويات", "sector": "Chemicals"},
    {"canonical": "ALMF", "name_en": "Arabian Real Estate Fund", "name_ar": "صندوق الاستثمار العقاري العربي", "sector": "Funds"},
    {"canonical": "MICH", "name_en": "Misr Chemical Industries", "name_ar": "مصر لصناعة الكيماويات", "sector": "Chemicals"},
    {"canonical": "VALR", "name_en": "Valmore Holding", "name_ar": "فال-more القابضة", "sector": "Diversified Holdings"},
    {"canonical": "VALRA", "name_en": "Valmore Holding - Preferred", "name_ar": "فال-more - ممتازة", "sector": "Diversified Holdings"},
    {"canonical": "RAYA", "name_en": "Raya Holding", "name_ar": "راية القابضة", "sector": "Technology"},
    {"canonical": "OIH", "name_en": "Orascom Investment Holding", "name_ar": "أوراسكوم للاستثمار", "sector": "Diversified Holdings"},
    {"canonical": "ODID", "name_en": "Six of October Development", "name_ar": "المصرية لمشروعات التنمية", "sector": "Real Estate"},
    {"canonical": "ESAC", "name_en": "Sabaa International Co.", "name_ar": "سبأ الدولية", "sector": "Pharma"},
    {"canonical": "GCAM", "name_en": "Global Corp for Agricultural", "name_ar": "جلوبال كورب", "sector": "Food"},
    {"canonical": "PMPP", "name_en": "Pioneers Holding", "name_ar": "القابضة المصرية الكويتية - بايونيرز", "sector": "Financial Services"},
    {"canonical": "GTHE", "name_en": "Global Telecom", "name_ar": "جلوبال تليكوم", "sector": "Telecom"},
    {"canonical": "VIEH", "name_en": "Vienna Egypt Hotels", "name_ar": "فيينا مصر للفنادق", "sector": "Hotels"},
    {"canonical": "AMPI", "name_en": "Arabian Food Industries (Domty)", "name_ar": "العربية للصناعات الغذائية - دومتي", "sector": "Food"},
    {"canonical": "SVCE", "name_en": "SODIC", "name_ar": "سوديك", "sector": "Real Estate"},
    {"canonical": "EGTS", "name_en": "Egyptian Transport", "name_ar": "المصرية للنقل", "sector": "Logistics"},
    {"canonical": "ACES", "name_en": "ACES For Trading & Agencies", "name_ar": "أيس للتجارة", "sector": "Trading"},
    {"canonical": "ASCM", "name_en": "ASEC Mining (ASCOM)", "name_ar": "أسيك للتعدين - أسكوم", "sector": "Mining"},
    {"canonical": "GSSC", "name_en": "Ghabbour Group", "name_ar": "مجموعة غبور", "sector": "Automotive"},
    {"canonical": "ANFI", "name_en": "Arabian Food - Elnasr", "name_ar": "العربية للأغذية - النصر", "sector": "Food"},
    {"canonical": "MEGM", "name_en": "Middle East Glass", "name_ar": "الشرق الأوسط للزجاج", "sector": "Industrials"},
    {"canonical": "AIH", "name_en": "Arabian Industries Holding", "name_ar": "العربية للصناعات القابضة", "sector": "Industrials"},
    {"canonical": "CIRA", "name_en": "Cairo for Investment & Real Estate", "name_ar": "القاهرة للاستثمار", "sector": "Real Estate"},
    {"canonical": "SUCE", "name_en": "SUEZ Cement", "name_ar": "أسمنت السويس", "sector": "Cement"},
    {"canonical": "ECAP", "name_en": "Egyptian for Construction", "name_ar": "المصرية للإنشاءات", "sector": "Construction"},
    {"canonical": "ELEC", "name_en": "Electro Cable Egypt", "name_ar": "الإلكترونية للكابلات", "sector": "Industrials"},
    {"canonical": "MOIN", "name_en": "Nasr Co. for Intermediate Chemicals", "name_ar": "النصر للكيماويات الوسيطة", "sector": "Chemicals"},
    {"canonical": "ETRS", "name_en": "Egyptian Transport & Commercial", "name_ar": "المصرية للنقل والتجارة", "sector": "Logistics"},
    {"canonical": "ENGC", "name_en": "Engineering Industries (ICON)", "name_ar": "الصناعات الهندسية", "sector": "Industrials"},
    {"canonical": "APLE", "name_en": "Al Ahly for Real Estate", "name_ar": "الأهلي للإسكان", "sector": "Real Estate"},
    {"canonical": "MENA", "name_en": "Mena Touristic & Real Estate", "name_ar": "مينا للسياحة", "sector": "Real Estate"},
    {"canonical": "GBCO", "name_en": "GB Corp", "name_ar": "جي بي كورب", "sector": "Automotive"},
    {"canonical": "AMER", "name_en": "Amer Group", "name_ar": "عامر جروب", "sector": "Real Estate"},
    {"canonical": "OCDI", "name_en": "October Pharma", "name_ar": "أكتوبر فارما", "sector": "Pharma"},
    {"canonical": "EDBI", "name_en": "EDB Industrial Parks", "name_ar": "إي دي بي للمناطق الصناعية", "sector": "Real Estate"},
    {"canonical": "MPCO", "name_en": "Misr Petroleum", "name_ar": "مصر للبترول", "sector": "Energy"},
    {"canonical": "PRDC", "name_en": "Pyramisa Hotels", "name_ar": "فنادق بيراميزا", "sector": "Hotels"},
    {"canonical": "MCSC", "name_en": "Misr Co. for Supply", "name_ar": "مصر للتوريدات", "sector": "Trading"},
    {"canonical": "ESHP", "name_en": "Eshra El Mostakbal", "name_ar": "إيشيرا المستقبل", "sector": "Real Estate"},
    {"canonical": "OASR", "name_en": "El Nasr Co. for Steel Pipes", "name_ar": "النصر لمواسير الصلب", "sector": "Steel"},
    {"canonical": "MPCI", "name_en": "Misr Pharmaceuticals Industries", "name_ar": "مصر للصناعات الدوائية", "sector": "Pharma"},
    {"canonical": "AXA", "name_en": "AXA for Cooperative Insurance", "name_ar": "أكسا للتأمين التعاوني", "sector": "Insurance"},
    {"canonical": "REAYA", "name_en": "Reaya Medical", "name_ar": "الرعاية الطبية", "sector": "Healthcare"},
]


def get_canonical(symbol: str) -> str:
    """Normalize a user-entered ticker to canonical uppercase (no exchange suffix)."""
    s = (symbol or "").strip().upper()
    for suffix in (".CA", ".EGX", ".EG"):
        if s.endswith(suffix):
            s = s[: -len(suffix)]
    return s


def get_yahoo_symbol(canonical: str) -> str:
    """Return the Yahoo Finance symbol for an EGX canonical ticker."""
    return f"{get_canonical(canonical)}.CA"


def find_egx_stock(canonical: str) -> EgxStock | None:
    c = get_canonical(canonical)
    for row in EGX_STOCKS:
        if row["canonical"] == c:
            return row
    return None
