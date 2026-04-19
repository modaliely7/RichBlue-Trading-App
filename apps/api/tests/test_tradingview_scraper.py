from apps.api.app import data_providers


def test_fetch_tradingview_html_parses_basic(monkeypatch):
    html = """
    <html>
      <body>
        <div class="tv-symbol-price-quote__value">100.25</div>
        <table>
          <tr><td>Market Cap</td><td>2.5B</td></tr>
          <tr><td>EPS (TTM)</td><td>3.5</td></tr>
        </table>
      </body>
    </html>
    """

    class FakeResp:
        status_code = 200
        text = html

    def fake_get(url, headers=None, timeout=None):
        return FakeResp()

    monkeypatch.setattr(data_providers.requests, "get", fake_get)

    res = data_providers.fetch_tradingview_html("ABC")
    assert res is not None
    assert res.get("current_price") == 100.25
    assert res.get("market_cap") == 2.5e9
    assert res.get("eps") == 3.5
