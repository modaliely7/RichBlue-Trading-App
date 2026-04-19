from apps.api.app import data_providers


def test_fetch_egx_html_parses_basic(monkeypatch):
    html = """
    <html>
      <body>
        <div><span class="price">14.5</span></div>
        <table>
          <tr><td>Market Cap</td><td>1.2B</td></tr>
          <tr><td>EPS</td><td>0.75</td></tr>
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

    res = data_providers.fetch_egx_html("XYZ")
    assert res is not None
    assert res.get("current_price") == 14.5
    assert res.get("market_cap") == 1.2e9
    assert res.get("eps") == 0.75
