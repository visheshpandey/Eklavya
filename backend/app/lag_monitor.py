"""Event-loop lag monitor.

Voice sockets are answered by the same event loop that runs every request. When that loop is stuck for about 20 seconds
the server stops answering pings and drops every voice session ("keepalive ping timeout", close code 1011). This logs a
warning whenever the loop was blocked for more than ``WARN_AFTER`` seconds, and, from a helper thread, where it was stuck.
"""
import asyncio
import logging
import sys
import threading
import time
import traceback

log = logging.getLogger(__name__)
INTERVAL = 0.25     # how often the loop proves it is alive
WARN_AFTER = 1.0    # a stall longer than this is logged


async def watch() -> None:
    """Run for the life of the server (started from app.main)."""
    loop_thread = threading.get_ident()
    last_tick = [time.monotonic()]
    reported = [False]

    def sample() -> None:   # a separate thread: the loop itself cannot report that it is stuck
        while True:
            time.sleep(INTERVAL * 2)
            if time.monotonic() - last_tick[0] > WARN_AFTER and not reported[0]:
                reported[0] = True
                frame = sys._current_frames().get(loop_thread)
                where = "".join(traceback.format_stack(frame)[-6:]) if frame else "unknown"
                log.warning("The event loop has been blocked for over %.0f s. It is stuck here:\n%s", WARN_AFTER, where)

    threading.Thread(target=sample, name="loop-lag-sampler", daemon=True).start()
    while True:
        await asyncio.sleep(INTERVAL)
        now = time.monotonic()
        late = now - last_tick[0] - INTERVAL
        if late > WARN_AFTER:
            log.warning("The event loop was blocked for %.1f s (voice sessions drop at about 20 s)", late)
        reported[0] = False
        last_tick[0] = now
