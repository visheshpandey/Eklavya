"""Notes from a link: a YouTube video (Gemini watches it) or a web article (fetched here, then Gemini keeps the study content).

The server fetches pages the user names, so every address is checked first: only http(s), only public internet addresses
(never this machine or a private network), no more than a few redirects, and a size cap. Results are cached for 10 minutes.
"""
from __future__ import annotations

import ipaddress
import re
import socket
import threading
import time
from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse

import requests

from app.ai.gemini import notes_from_article, read_video
from app.errors import BadRequestError

CACHE_SECONDS = 10 * 60
MAX_PAGE_BYTES = 3 * 1024 * 1024
MAX_ARTICLE_CHARS = 60_000
MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 15
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; EklavyaNotes/1.0)", "Accept": "text/html,application/xhtml+xml"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

_cache: dict[str, tuple[float, tuple[str, str]]] = {}
_cache_lock = threading.Lock()


def youtube_id(url: str) -> str | None:
    parts = urlparse(url)
    if parts.hostname not in YOUTUBE_HOSTS:
        return None
    if parts.hostname.endswith("youtu.be"):
        candidate = parts.path.strip("/").split("/")[0]
    elif parts.path.startswith(("/shorts/", "/live/", "/embed/")):
        candidate = parts.path.split("/")[2] if len(parts.path.split("/")) > 2 else ""
    else:
        candidate = (parse_qs(parts.query).get("v") or [""])[0]
    return candidate if VIDEO_ID.match(candidate or "") else None


def _check_public(url: str) -> None:
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise BadRequestError("Paste a full web address that starts with http:// or https://")
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(parts.hostname, parts.port or None)}
    except socket.gaierror:
        raise BadRequestError("That website could not be found. Check the address.") from None
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global:
            raise BadRequestError("That address is not a public website.")


class _TextOnly(HTMLParser):
    """Visible text of a page, without scripts, styles, menus, headers and footers."""
    SKIP = {"script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "iframe"}
    BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br", "tr", "section", "article", "pre", "blockquote"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.skipping, self.title, self._in_title = [], 0, "", False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skipping += 1
        elif tag == "title":
            self._in_title = True
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skipping:
            self.skipping -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self.skipping:
            self.parts.append(data)

    def text(self) -> str:
        lines = (" ".join(line.split()) for line in "".join(self.parts).splitlines())
        return "\n".join(line for line in lines if line)


def _fetch_page(url: str) -> tuple[str, str]:
    """(title, visible text) of a public web page."""
    for _ in range(MAX_REDIRECTS + 1):
        _check_public(url)   # checked again after every redirect, so a public page cannot bounce us to a private one
        try:
            response = requests.get(url, headers=HEADERS, timeout=TIMEOUT_SECONDS, stream=True, allow_redirects=False)
        except requests.RequestException:
            raise BadRequestError("That page could not be opened. Check the address, or try again later.") from None
        if response.is_redirect and response.headers.get("location"):
            url = urljoin(url, response.headers["location"])
            continue
        if response.status_code >= 400:
            raise BadRequestError(f"That page could not be opened (the website answered {response.status_code}).")
        if "html" not in response.headers.get("content-type", "html"):
            raise BadRequestError("That link is not a web page. For a PDF, download it and use Upload notes.")
        body = response.raw.read(MAX_PAGE_BYTES + 1, decode_content=True)
        if len(body) > MAX_PAGE_BYTES:
            raise BadRequestError("That page is too large to read.")
        parser = _TextOnly()
        parser.feed(body.decode(response.encoding or "utf-8", errors="ignore"))
        return " ".join(parser.title.split()), parser.text()
    raise BadRequestError("That link redirects too many times.")


def notes_from_link(url: str) -> tuple[str, str]:
    """(a name for the notes, the notes text). Raises BadRequestError or LLMError with a message for the student."""
    url = url.strip()
    with _cache_lock:
        hit = _cache.get(url)
        if hit and time.time() - hit[0] < CACHE_SECONDS:
            return hit[1]
    video = youtube_id(url)
    if video:
        notes = read_video(f"https://www.youtube.com/watch?v={video}")
        if not notes:
            raise BadRequestError("Could not find study content in that video. Is it public, and does it teach something?")
        result = (f"YouTube video {video}", notes)
    else:
        title, text = _fetch_page(url)
        if len(text) < 200:
            raise BadRequestError("Could not find enough text on that page. Some sites only show their text to browsers.")
        notes = notes_from_article(text[:MAX_ARTICLE_CHARS])
        if not notes:
            raise BadRequestError("Could not find study content on that page.")
        result = ((title or urlparse(url).hostname or "Web page")[:120], notes)
    with _cache_lock:
        _cache[url] = (time.time(), result)
    return result
