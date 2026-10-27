"""Database: connection helpers + schema for the PRD tables.

Two engines behind one small API (get_conn / query / one / execute): SQLite (stdlib, a local file; the default for
development and tests) and Postgres (psycopg, used when DATABASE_URL is set; needed on hosts with no persistent disk).
The SQL in the rest of the app is written once, in SQLite style with ``?`` placeholders; the Postgres engine translates it.
Every call takes its own connection, so it is safe to use from FastAPI threads and from the voice WebSocket tasks.
"""
import json
import logging
import re
import sqlite3
from contextlib import contextmanager

from app.config import settings

log = logging.getLogger(__name__)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT, email TEXT,
    preferred_language TEXT DEFAULT 'hinglish',
    daily_study_minutes INTEGER DEFAULT 30, target_exam_date TEXT
);
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, file_name TEXT,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_status TEXT DEFAULT 'processed'
);
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER,
    topic_name TEXT, parent_topic_id INTEGER
);
CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER, topic_id INTEGER,
    heading TEXT, text TEXT, page INTEGER
);
CREATE TABLE IF NOT EXISTS learner_mastery (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER,
    mastery_score REAL DEFAULT 50, confidence_score REAL DEFAULT 0.5,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, topic_id)
);
CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER, question TEXT,
    options TEXT, correct TEXT, explanation TEXT, misconceptions TEXT,
    difficulty TEXT DEFAULT 'Medium'
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER,
    question_id INTEGER, question TEXT, student_answer TEXT, is_correct INTEGER,
    confidence REAL, mastery_before REAL, mastery_after REAL,
    answered_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS misconceptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER,
    misconception_text TEXT, label TEXT, severity TEXT,
    detected_at TEXT DEFAULT CURRENT_TIMESTAMP, resolved INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS study_missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER,
    mission_title TEXT, reason TEXT, duration_minutes INTEGER, priority TEXT,
    tasks TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, agent_name TEXT,
    observation TEXT, decision TEXT, action_taken TEXT, confidence REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS learner_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER,
    confusion REAL, confidence REAL, frustration REAL, note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS voice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP, ended_at TEXT, mode TEXT,
    language TEXT, turns INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, role TEXT, text TEXT,
    ts TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chunk_embeddings (
    chunk_id INTEGER PRIMARY KEY, vector TEXT
);
CREATE TABLE IF NOT EXISTS vivas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT,
    marks REAL, out_of INTEGER, strengths TEXT, improve TEXT
);
CREATE TABLE IF NOT EXISTS viva_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, viva_id INTEGER, question TEXT, answer_summary TEXT,
    mark REAL, feedback TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS debates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER, motion TEXT,
    tutor_side TEXT, style TEXT, started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT,
    winner TEXT, student_score REAL, tutor_score REAL, strength TEXT, improve TEXT
);
CREATE TABLE IF NOT EXISTS debate_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT, debate_id INTEGER, evidence REAL, logic REAL,
    rebuttal REAL, strength REAL, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER, title TEXT, kind TEXT, data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, topic_id INTEGER, front TEXT, back TEXT,
    source TEXT DEFAULT 'notes', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

# Columns added after the first release: (table, column, type). init_db adds any that an older database lacks.
MIGRATIONS = (
    ("voice_sessions", "study_mode", "TEXT"),
    ("voice_sessions", "topic_id", "INTEGER"),
    ("users", "password_hash", "TEXT"),
    ("misconceptions", "question_id", "INTEGER"),   # the question the mistake was made on (flashcards from mistakes)
)


PG = bool(settings.database_url)

# ---------------------------------------------------------------- Postgres engine
_NOW = "to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')"   # the same text format SQLite's CURRENT_TIMESTAMP gives
_pool = None


def _get_pool():
    global _pool
    if _pool is None:
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool
        kwargs = {"row_factory": dict_row, "prepare_threshold": None}   # no prepared statements: the Neon pooler does not keep them
        if settings.db_schema:
            kwargs["options"] = f"-c search_path={settings.db_schema}"
        _pool = ConnectionPool(settings.database_url, kwargs=kwargs, min_size=1, max_size=8, open=False,
                               check=ConnectionPool.check_connection)   # Neon closes idle connections: test one before handing it out
        _pool.open(wait=True, timeout=30)
    return _pool


def _pg_sql(sql, returning=True):
    """SQLite-style statement -> Postgres: ? placeholders, OR IGNORE/REPLACE, timestamps, and RETURNING id for inserts."""
    sql = sql.replace("%", "%%").replace("?", "%s").replace("CURRENT_TIMESTAMP", _NOW)
    if re.match(r"\s*INSERT OR REPLACE INTO chunk_embeddings", sql):
        return sql.replace("INSERT OR REPLACE INTO", "INSERT INTO", 1) + " ON CONFLICT (chunk_id) DO UPDATE SET vector = EXCLUDED.vector"
    ignore = bool(re.match(r"\s*INSERT OR IGNORE", sql))
    if ignore:
        sql = sql.replace("INSERT OR IGNORE INTO", "INSERT INTO", 1) + " ON CONFLICT DO NOTHING"
    if returning and re.match(r"\s*INSERT INTO (?!chunk_embeddings)", sql):
        sql += " RETURNING id"
    return sql


def _pg_args(args):
    return tuple(int(a) if isinstance(a, bool) else a for a in args)   # SQLite stores True as 1; Postgres would reject it for an integer column


class _PgCursor:
    def __init__(self, cursor, sql):
        self._cursor = cursor
        self.lastrowid = None
        if cursor.description and sql.rstrip().endswith("RETURNING id"):
            row = cursor.fetchone()
            self.lastrowid = row["id"] if row else None

    rowcount = property(lambda self: self._cursor.rowcount)

    def fetchall(self):
        return self._cursor.fetchall() if self._cursor.description else []

    def __iter__(self):
        return iter(self.fetchall())


class _PgConn:
    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, args=()):
        sql = _pg_sql(sql)
        return _PgCursor(self._conn.execute(sql, _pg_args(args)), sql)

    def executemany(self, sql, rows):
        with self._conn.cursor() as cursor:
            cursor.executemany(_pg_sql(sql, returning=False), [_pg_args(r) for r in rows])

    def executescript(self, script):
        for statement in script.split(";"):
            if statement.strip():
                self._conn.execute(statement)


def _pg_schema(script):
    script = re.sub(r"\bid INTEGER PRIMARY KEY AUTOINCREMENT", "id SERIAL PRIMARY KEY", script)
    script = re.sub(r"\bid INTEGER PRIMARY KEY,", "id SERIAL PRIMARY KEY,", script)     # users: SQLite numbers these by itself
    return script.replace(" REAL", " DOUBLE PRECISION").replace("CURRENT_TIMESTAMP", _NOW.join(("(", ")")))


# ---------------------------------------------------------------- shared helpers
@contextmanager
def get_conn():
    """Open a connection, commit on success, roll back (and log) on any error, always close/return it."""
    if PG:
        try:
            with _get_pool().connection() as conn:
                yield _PgConn(conn)
        except Exception:
            log.exception("Database operation failed; rolled back")
            raise
        return
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        log.exception("Database operation failed; rolled back")
        raise
    finally:
        conn.close()


def init_db():
    with get_conn() as c:
        if PG:
            if settings.db_schema:
                c.executescript(f"CREATE SCHEMA IF NOT EXISTS {settings.db_schema}")
            c.executescript(_pg_schema(SCHEMA))
            for table, column, kind in MIGRATIONS:
                c.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {kind}")
        else:
            c.executescript(SCHEMA)
            for table, column, kind in MIGRATIONS:
                existing = {row[1] for row in c.execute(f"PRAGMA table_info({table})")}
                if column not in existing:
                    c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(email)")   # NULL emails (the demo student) never collide
    ensure_user(settings.demo_user_id)   # reserve the demo id so a new account can never be given it
    if PG:   # the demo row was inserted with an explicit id: move the sequence past it
        with get_conn() as c:
            c.execute("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users))")


def query(sql, args=()):
    with get_conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def one(sql, args=()):
    rows = query(sql, args)
    return rows[0] if rows else None


def execute(sql, args=()):
    """Run a write and return the new row id."""
    with get_conn() as c:
        return c.execute(sql, args).lastrowid


def ensure_user(user_id, name="Demo Student"):
    if not one("SELECT id FROM users WHERE id = ?", (user_id,)):
        execute("INSERT INTO users (id, name) VALUES (?, ?)", (user_id, name))


def save_learner_state(user_id, topic_id, confusion, confidence, frustration, note=""):
    """Store one tone reading from the live tutor (report_learner_state tool)."""
    return execute(
        "INSERT INTO learner_state (user_id, topic_id, confusion, confidence, frustration, note)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, topic_id, confusion, confidence, frustration, note),
    )


def latest_confidence(user_id, default=0.5):
    row = one("SELECT confidence FROM learner_state WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,))
    return row["confidence"] if row and row["confidence"] is not None else default


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False)


def loads(s, default=None):
    try:
        return json.loads(s) if s else default
    except (TypeError, ValueError):
        return default
