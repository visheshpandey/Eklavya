"""Checks the tutor prompts against the real Gemini Live API through the backend's WebSocket (typed turns, no audio).

    python prompts.py [viva|gender|language|debate]

Needs a throwaway backend with the demo notes loaded (see README.md). LLM behaviour varies a little from run to run:
each check prints what the tutor said so you can judge it, and exits non-zero when a rule was clearly broken.
Environment: API (default http://localhost:5002).
"""
import asyncio
import json
import os
import re
import sys
import urllib.request

import websockets

API = os.environ.get("API", "http://localhost:5002")
WS = API.replace("http", "ws", 1)
GENDERED = re.compile(r"\b(karoge|karogi|dogi|doge|bologe|bologi|jaoge|jaogi|loge|logi|sakoge|sakogi|likhogi|likhoge|batogi|batoge)\b", re.I)
HINDI_MARKERS = re.compile(r"\b(hai|hain|ka|ki|ke|ko|mein|me|aap|toh|to|kya|nahi|yeh|ye|woh|se|par|pe|hota|hoga|karein|batayein|dekhiye|chaliye|accha|achha|theek)\b", re.I)


def topic_id(name):
    data = json.load(urllib.request.urlopen(f"{API}/api/dashboard"))
    return next(m["topic_id"] for m in data["mastery"] if m["topic_name"] == name)


async def session(query, script, until, timeout=90):
    """Open a session, run `script(send, wait_for)` and return every JSON event received."""
    events = []
    async with websockets.connect(f"{WS}/ws/voice?{query}", max_size=None) as ws:
        async def reader():
            async for message in ws:
                if isinstance(message, str):
                    events.append(json.loads(message))
        task = asyncio.create_task(reader())

        async def send(text):
            await ws.send(json.dumps({"type": "user_text", "text": text}))

        async def wait_for(predicate, seconds=timeout):
            end = asyncio.get_event_loop().time() + seconds
            while asyncio.get_event_loop().time() < end:
                hit = next((e for e in events if predicate(e)), None)
                if hit:
                    return hit
                await asyncio.sleep(0.3)
            return None

        await script(send, wait_for, events)
        await ws.send(json.dumps({"type": "end"}))
        task.cancel()
    return events


def tutor_text(events):
    return " ".join(e["text"] for e in events if e["type"] == "transcript" and e["role"] == "tutor" and e["final"])


def finals(events):
    return [e for e in events if e["type"] == "transcript" and e["role"] == "tutor" and e["final"] and e["text"]]


def summary(events):
    counts = {}
    for e in events:
        counts[e["type"]] = counts.get(e["type"], 0) + 1
    errors = [e["message"] for e in events if e["type"] == "error"]
    return f"events: {counts}" + (f" ERRORS: {errors}" if errors else "")


async def viva():
    ok = True
    for attempt in (1, 2):
        async def script(send, wait_for, events):
            q = await wait_for(lambda e: e["type"] == "viva_question")
            script.question = q["question"] if q else None
            await asyncio.sleep(2)
            # a true statement about a DIFFERENT concept than most questions on precision / confusion matrices
            await send("Recall is TP divided by TP plus FN. It tells how many of the real spam emails the filter managed to catch.")
            script.mark = await wait_for(lambda e: e["type"] == "viva_mark")
        events = await session(f"user_id=1&lang=english&mode=viva&topic_id={topic_id('Precision')}", script, None)
        q, m = script.question, script.mark
        print(f"viva run {attempt}: question={q!r}")
        print(f"   answer was about recall -> mark={m and m['mark']} feedback={m and m['feedback']!r}")
        if q and "recall" not in q.lower() and m and m["mark"] > 0:
            ok = False
            print("   FAIL: an answer about recall earned marks for a question that was not about recall")
    return ok


async def gender():
    async def script(send, wait_for, events):
        await wait_for(lambda e: len(finals(events)) >= 1, 60)                       # the opening explanation is finished
        await send("Mujhe precision aur recall ka difference samjhao, aur phir mujhse ek sawal poochho.")
        await wait_for(lambda e: len(finals(events)) >= 2, 60)
        await asyncio.sleep(2)
    events = await session(f"user_id=1&lang=hinglish&mode=learn&topic_id={topic_id('Recall')}", script, None, timeout=60)
    text = tutor_text(events)
    print("hinglish learn session,", summary(events))
    print("   tutor said:", " ".join(text[:500].split()))
    if not text.strip():
        print("   NOTHING TO CHECK: the tutor said nothing (Gemini busy or the session ended early)")
        return False
    bad = GENDERED.findall(text)
    print("   gendered forms found:", bad or "none")
    return not bad


async def language():
    async def script(send, wait_for, events):
        await wait_for(lambda e: len(finals(events)) >= 3, 90)                       # recap, then the first question(s)
        await asyncio.sleep(2)
    events = await session(f"user_id=1&lang=hinglish&mode=revise&topic_id={topic_id('F1 Score')}", script, None, timeout=90)
    turns = [e["text"] for e in finals(events)]
    print("hinglish quick revision,", summary(events))
    if not turns:
        print("   NOTHING TO CHECK: the tutor said nothing")
        return False
    drift = []
    for t in turns:
        has_hindi = bool(HINDI_MARKERS.search(t))
        print(f"   [{'hinglish' if has_hindi else 'ENGLISH ONLY'}] {t[:140]!r}")
        if len(t.split()) >= 8 and not has_hindi:
            drift.append(t)
    return not drift


async def debate():
    async def script(send, wait_for, events):
        await wait_for(lambda e: len(finals(events)) >= 1, 90)
        await asyncio.sleep(2)
    events = await session(f"user_id=1&lang=english&mode=debate&topic_id={topic_id('Recall')}&side=for&style=tough", script, None, timeout=70)
    text = tutor_text(events)
    print("debate opener:", text[:600].replace("\n", " "))
    low = text.lower()
    wrong = bool(re.search(r"low recall[^.]*(spam folder|marked as spam|sent to spam|flagged)|recall[^.]*important emails?[^.]*spam", low))
    print("   claims that low recall sends good emails to spam:", "YES (wrong)" if wrong else "no")
    return not wrong


CHECKS = {"viva": viva, "gender": gender, "language": language, "debate": debate}

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(CHECKS)
    results = {}
    for name in wanted:
        results[name] = asyncio.run(CHECKS[name]())
        print(f"=> {name}: {'ok' if results[name] else 'PROBLEM'}\n")
    sys.exit(0 if all(results.values()) else 1)
