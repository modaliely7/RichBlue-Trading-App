from apps.api.app import data_providers


def test_fetch_investing_html_parses_search_and_quote(monkeypatch):
    search_html = '<html><body><a href="/equities/example-company">Example</a></body></html>'
    quote_html = """
    <html>
      <body>
        <span id="last_last">45.70</span>
        <table>
          <tr><td>Market Cap</td><td>200M</td></tr>
          <tr><td>EPS</td><td>1.2</td></tr>
        </table>
      </body>
    </html>
    """

    class FakeResp:
        def __init__(self, text):
            self.status_code = 200
            self.text = text

    def fake_get(url, headers=None, timeout=None):
        if "search/?q=" in url:
            return FakeResp(search_html)
        return FakeResp(quote_html)

    monkeypatch.setattr(data_providers.requests, "get", fake_get)

    res = data_providers.fetch_investing_html("EXM")
    assert res is not None
    assert res.get("current_price") == 45.7
    assert res.get("market_cap") == 200e6
    assert res.get("eps") == 1.2
