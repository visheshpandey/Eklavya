"""Concept map (pure): which topics are connected, judged by how often one topic's notes talk about another."""
from app.domain.retrieval import tokenize

MAX_LINKS_PER_TOPIC = 3


def _mentions(text_tokens: set, topic_tokens: set) -> bool:
    """A passage mentions a topic when it contains all of the topic's words (all but one for long names)."""
    if not topic_tokens:
        return False
    hits = len(topic_tokens & text_tokens)
    return hits == len(topic_tokens) or (len(topic_tokens) > 2 and hits >= len(topic_tokens) - 1)


def build_links(topics, chunks):
    """``topics``: [{id, topic_name}]; ``chunks``: [{topic_id, heading, text}] (topic_id may be None).

    Returns [{source, target, weight}] (undirected, source < target): the strongest few links per topic.
    """
    names = {t["id"]: set(tokenize(t["topic_name"])) for t in topics}
    weights = {}
    for c in chunks:
        owner = c.get("topic_id")
        if owner not in names:
            continue
        tokens = set(tokenize(f"{c.get('heading') or ''} {c.get('text') or ''}"))
        for other, other_tokens in names.items():
            if other != owner and _mentions(tokens, other_tokens):
                key = (min(owner, other), max(owner, other))
                weights[key] = weights.get(key, 0) + 1
    kept, per_topic = [], {}
    for (a, b), weight in sorted(weights.items(), key=lambda kv: (-kv[1], kv[0])):
        if per_topic.get(a, 0) < MAX_LINKS_PER_TOPIC and per_topic.get(b, 0) < MAX_LINKS_PER_TOPIC:
            kept.append({"source": a, "target": b, "weight": weight})
            per_topic[a] = per_topic.get(a, 0) + 1
            per_topic[b] = per_topic.get(b, 0) + 1
    return kept
