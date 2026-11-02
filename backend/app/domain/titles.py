"""Human titles for notes (pure): never "page", "n" or a raw id.

Order: the file's own metadata title (PDF) -> a heading in the text -> a web page / video title (given by the caller)
-> a short title written by the model from the first 1,500 characters (caller supplies it) -> the file name without its extension.
"""
import re

# names that say nothing about the notes
_EMPTY = {"page", "pages", "n", "index", "untitled", "document", "doc", "file", "notes", "note", "text", "new", "scan", "image", "img",
          "download", "output", "pasted notes", "pasted-notes", "copy", "web page"}
_ID_LIKE = re.compile(r"^(?:[0-9a-f]{8,}|[\w-]{11}|\d+|(?:img|dsc|scan|image|photo|screenshot)[\W_]*\d*)$", re.I)
_EXTENSION = re.compile(r"\.(?:pdf|txt|md|png|jpe?g|webp|heic|docx?)$", re.I)

KIND_BY_EXTENSION = {"pdf": "pdf", "txt": "text", "md": "text", "png": "photo", "jpg": "photo", "jpeg": "photo", "webp": "photo", "heic": "photo"}


def stem(name: str) -> str:
    """A file name without its extension, with separators turned into spaces."""
    base = _EXTENSION.sub("", str(name or "").strip())
    return re.sub(r"[\s_\-]+", " ", base).strip()


def is_weak(name: str) -> bool:
    """True when `name` would not help a student recognise their notes."""
    text = stem(name).lower()
    return len(text) < 3 or text in _EMPTY or bool(_ID_LIKE.match(text.replace(" ", ""))) or text.replace(" ", "").isdigit()


def heading_title(text: str) -> str | None:
    """The first markdown heading or the first short title-like line of the text."""
    for line in str(text or "").splitlines()[:40]:
        line = line.strip()
        if not line:
            continue
        match = re.match(r"^#{1,2}\s+(.{3,90})$", line)
        if match:
            return _clean(match.group(1))
        if len(line) <= 70 and not line.endswith((".", ",", ";")) and re.search(r"[A-Za-zऀ-ॿ]{3}", line) and len(line.split()) <= 9:
            return _clean(line)
        break   # the first real line is a sentence: there is no heading
    return None


def _clean(title: str) -> str:
    title = re.sub(r"[*_`#>]+", "", title)
    title = re.sub(r"^(?:chapter|unit|module|lecture)\s*\d+\s*[:.\-]\s*", "", title.strip(), flags=re.I)
    return re.sub(r"\s+", " ", title).strip(" -:.")[:80]


def best_title(file_name: str, text: str = "", metadata_title: str | None = None, model_title: str | None = None, name_first: bool = False) -> str:
    """The title to store. `name_first` is for links and videos, whose given name already is the page or video title."""
    def usable(title) -> bool:
        return bool(title) and not is_weak(str(title)) and len(_clean(str(title))) >= 3
    name = stem(file_name) if not name_first else _clean(str(file_name))
    order = [("meta", metadata_title), ("name", name if usable(name) else None)] if name_first else         [("meta", metadata_title), ("heading", heading_title(text)), ("name", name if usable(name) else None), ("model", model_title)]
    for _, candidate in order:
        if usable(candidate):
            return _clean(str(candidate))
    return name or "Study notes"


def subject_of(topic_name: str, document_title: str = "") -> str:
    """The subject a topic belongs to: the part before a colon ("OS: Paging" -> "OS"), else the notes' own title."""
    match = re.match(r"^([^:]{2,28}):\s+\S", str(topic_name or ""))
    return match.group(1).strip() if match else (stem(document_title) or "Notes")


def kind_for(file_name: str, url: str | None = None) -> str:
    """'pdf' | 'text' | 'photo' | 'youtube' | 'link'."""
    if url:
        return "youtube" if re.search(r"(?:youtube\.com|youtu\.be)", url) else "link"
    if str(file_name).lower().startswith("youtube video"):
        return "youtube"
    ext = str(file_name).rsplit(".", 1)[-1].lower() if "." in str(file_name) else ""
    return KIND_BY_EXTENSION.get(ext, "text")


def normalise_url(url: str) -> str:
    """The same page written two ways (tracking parameters, a trailing slash, youtu.be) compares equal."""
    url = str(url or "").strip()
    match = re.search(r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/))([\w-]{11})", url)
    if match:
        return f"youtube:{match.group(1)}"
    url = re.sub(r"#.*$", "", url)
    url = re.sub(r"[?&](?:utm_[a-z]+|fbclid|gclid|ref)=[^&]*", "", url)
    return re.sub(r"^https?://(?:www\.)?", "", url).rstrip("/?&").lower()
