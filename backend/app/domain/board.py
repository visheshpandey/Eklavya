"""Whiteboard cards the live tutor shows while it talks (pure: no network, no database).

The model calls the ``show_board`` tool with loose arguments; ``clean_board`` turns them into one small,
safe card for the browser, or raises ``ValueError`` with a message the model can act on.

Kinds:
  formula  a formula in big type (``formula``), optional "where" lines (``items``) and a worked ``result``
  steps    numbered steps (``items``); ``highlight`` (1-based) marks the step being spoken
  table    ``headers`` plus ``rows``; each row is one string with cells separated by "|"
"""

KINDS = ("formula", "steps", "table")
MAX_TITLE = 80
MAX_TEXT = 160        # one formula, step, line or result
MAX_ITEMS = 8
MAX_COLUMNS = 5
MAX_ROWS = 8
MAX_CELL = 60


def _text(value, limit: int) -> str:
    """One line of plain text: whitespace collapsed, cut to `limit` characters with an ellipsis."""
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _lines(values, limit: int, count: int) -> list:
    if isinstance(values, str):
        values = [values]
    return [line for line in (_text(v, limit) for v in (values or [])[:count]) if line]


def clean_board(args: dict) -> dict:
    kind = str(args.get("kind", "")).strip().lower()
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    title = _text(args.get("title"), MAX_TITLE)
    if not title:
        raise ValueError("title is required")
    board = {"kind": kind, "title": title}

    if kind == "formula":
        formula = _text(args.get("formula"), MAX_TEXT)
        if not formula:
            raise ValueError("a formula board needs formula")
        board["formula"] = formula
        board["items"] = _lines(args.get("items"), MAX_TEXT, MAX_ITEMS)
        board["result"] = _text(args.get("result"), MAX_TEXT)

    elif kind == "steps":
        items = _lines(args.get("items"), MAX_TEXT, MAX_ITEMS)
        if not items:
            raise ValueError("a steps board needs items")
        board["items"] = items
        try:
            highlight = int(args.get("highlight") or 0)
        except (TypeError, ValueError):
            highlight = 0
        board["highlight"] = highlight if 1 <= highlight <= len(items) else 0

    else:  # table
        raw_headers = args.get("headers") or []
        headers = [_text(h, MAX_CELL) for h in ([raw_headers] if isinstance(raw_headers, str) else raw_headers)[:MAX_COLUMNS]]
        if not any(headers):   # an empty corner cell is fine; all-empty is not
            raise ValueError("a table board needs headers")
        rows = []
        for raw in (args.get("rows") or [])[:MAX_ROWS]:
            cells = [_text(c, MAX_CELL) for c in str(raw).split("|")][: len(headers)]
            if any(cells):
                rows.append(cells + [""] * (len(headers) - len(cells)))
        if not rows:
            raise ValueError("a table board needs rows, cells separated by |")
        board["headers"], board["rows"] = headers, rows

    return board
