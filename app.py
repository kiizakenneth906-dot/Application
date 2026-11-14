import os
import sqlite3
from collections import Counter

from flask import Flask, abort, g, jsonify, render_template, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, template_folder=BASE_DIR, static_folder=None)
DB_PATH = os.environ.get("DATABASE_PATH", "portal.db")

AREAS = ["Central", "Kawempe", "Makindye", "Nakawa", "Rubaga"]
TYPES = ["Illegal dumping", "Missed pickup", "Overflowing bin", "Blocked drainage"]
STATUSES = ["Open", "Progress", "Resolved"]
SCHEDULE = {
    "Central": ["Mon", "Thu"], "Kawempe": ["Tue", "Fri"], "Makindye": ["Wed", "Sat"],
    "Nakawa": ["Mon", "Fri"], "Rubaga": ["Tue", "Sat"],
}
CONTACT = {"phone": "0755530904", "email": "www.solidwaste@gmail.com"}

SYSTEM_PROMPT = (
    "You are the friendly AI assistant of a Solid Waste Collection and Citizen Engagement "
    "Portal in Kampala, Uganda. Help residents report missed pickups and illegal dumping, "
    "understand schedules, waste segregation and recycling. Keep answers practical and under "
    "120 words. You cannot see live schedules; for urgent issues direct people to e-mail "
    f"{CONTACT['email']} or call {CONTACT['phone']}."
)


# ---------- database ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with sqlite3.connect(DB_PATH) as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS tickets(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL, area TEXT NOT NULL,
                loc TEXT DEFAULT '', details TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Open',
                created TEXT DEFAULT CURRENT_TIMESTAMP)"""
        )


init_db()


def all_tickets():
    rows = get_db().execute("SELECT id,type,area,loc,details,status,created FROM tickets ORDER BY id").fetchall()
    return [dict(r) for r in rows]


# ---------- AI helpers (optional) ----------
def ask_ai(prompt, system=SYSTEM_PROMPT):
    """Returns text from Claude if ANTHROPIC_API_KEY is set, otherwise None."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=key)
        msg = client.messages.create(
            model=os.environ.get("AI_MODEL", "claude-sonnet-4-6"),
            max_tokens=500, system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text
    except Exception as exc:  # network, key or model problems
        app.logger.warning("AI call failed: %s", exc)
        return None


FAQ = [
    (("dump", "illegal"), "To report illegal dumping, open the Report tab, tap your division on the map, choose 'Illegal dumping', add the nearest landmark and submit. You can follow the ticket under My reports."),
    (("not collected", "missed", "pickup", "collect"), "Sorry about the missed pickup. Check your division's collection days under Schedule, then report it in the Report tab so collectors can respond."),
    (("sort", "segregat", "separate", "recycl"), "Separate organic waste (food, garden), plastics, paper, metal and glass, and keep hazardous waste (batteries, medical, chemicals) apart. See the Learn tab for details."),
]


def faq_reply(text):
    t = text.lower()
    for keys, reply in FAQ:
        if any(k in t for k in keys):
            return reply
    return (f"I can help with reporting problems, collection days and recycling. For urgent issues "
            f"e-mail {CONTACT['email']} or call {CONTACT['phone']}.")


def rule_briefing(tickets):
    if not tickets:
        return "No tickets yet."
    by_area = Counter(t["area"] for t in tickets if t["status"] != "Resolved")
    by_type = Counter(t["type"] for t in tickets if t["status"] != "Resolved")
    open_n = sum(t["status"] == "Open" for t in tickets)
    prog_n = sum(t["status"] == "Progress" for t in tickets)
    lines = [f"Overview: {len(tickets)} tickets, {open_n} open, {prog_n} in progress."]
    if by_area:
        a, n = by_area.most_common(1)[0]
        lines.append(f"Priority 1: {a} has the most unresolved tickets ({n}). Send extra collectors there.")
    if by_type:
        ty, n = by_type.most_common(1)[0]
        lines.append(f"Priority 2: '{ty}' is the most common unresolved issue ({n}).")
    if open_n:
        lines.append(f"Action: assign collectors to the {open_n} open ticket(s) first.")
    lines.append("(Rule-based summary. Set ANTHROPIC_API_KEY to enable the AI briefing.)")
    return "\n".join(lines)


# ---------- pages and API ----------
@app.route("/")
def index():
    cfg = {"areas": AREAS, "types": TYPES, "schedule": SCHEDULE, "contact": CONTACT}
    return render_template("index.html", cfg=cfg)


@app.route("/<path:name>")
def public_files(name):
    # Only these two files are public; app.py and the database stay private.
    if name not in ("style.css", "app.js"):
        abort(404)
    return send_from_directory(BASE_DIR, name)


@app.get("/api/tickets")
def list_tickets():
    return jsonify(all_tickets())


@app.post("/api/tickets")
def create_ticket():
    d = request.get_json(silent=True) or {}
    if d.get("area") not in AREAS or d.get("type") not in TYPES:
        return jsonify(error="Please choose a valid division and problem type."), 400
    db = get_db()
    cur = db.execute(
        "INSERT INTO tickets(type,area,loc,details) VALUES(?,?,?,?)",
        (d["type"], d["area"], str(d.get("loc", ""))[:200], str(d.get("details", ""))[:1000]),
    )
    db.commit()
    return jsonify(id=cur.lastrowid), 201


@app.patch("/api/tickets/<int:tid>")
def update_ticket(tid):
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in STATUSES:
        return jsonify(error="Invalid status."), 400
    db = get_db()
    cur = db.execute("UPDATE tickets SET status=? WHERE id=?", (status, tid))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(error="Ticket not found."), 404
    return jsonify(ok=True)


@app.post("/api/demo")
def demo():
    db = get_db()
    if db.execute("SELECT COUNT(*) FROM tickets").fetchone()[0] == 0:
        sample = [
            ("Illegal dumping", "Kawempe", "Bwaise market", "Heap blocking the road", "Open"),
            ("Missed pickup", "Nakawa", "Ntinda", "Not collected for 2 weeks", "Progress"),
            ("Overflowing bin", "Central", "Kampala Rd", "Public bin full", "Resolved"),
            ("Blocked drainage", "Rubaga", "Lubaga", "Plastic clogging channel", "Open"),
            ("Missed pickup", "Makindye", "Kansanga", "Truck did not come", "Progress"),
            ("Illegal dumping", "Kawempe", "Kyebando", "New dump site", "Resolved"),
            ("Missed pickup", "Kawempe", "Kawempe", "Skipped Tuesday", "Open"),
        ]
        db.executemany("INSERT INTO tickets(type,area,loc,details,status) VALUES(?,?,?,?,?)", sample)
        db.commit()
    return jsonify(ok=True)


@app.post("/api/chat")
def chat():
    d = request.get_json(silent=True) or {}
    message = str(d.get("message", "")).strip()[:500]
    if not message:
        return jsonify(reply="Please type a question."), 400
    history = "\n".join(str(h)[:300] for h in (d.get("history") or [])[-8:])
    reply = ask_ai(f"Conversation so far:\n{history}\n\nResident: {message}\n\nReply as the Assistant.")
    return jsonify(reply=reply or faq_reply(message))


@app.post("/api/briefing")
def briefing():
    tickets = all_tickets()
    if not tickets:
        return jsonify(error="Add some tickets first."), 400
    data = "\n".join(f"{t['type']} | {t['area']} | {t['loc'] or '-'} | {t['status']}" for t in tickets)
    text = ask_ai(
        "You coordinate solid waste collection in Kampala. Below are citizen tickets "
        "(type | division | location | status). Write a briefing with: 1) top 3 priorities, "
        "2) which divisions need extra trucks or collectors, 3) patterns you notice, "
        "4) two recommended actions. Use only the data given, under 200 words, plain text.\n\n" + data
    )
    return jsonify(text=text or rule_briefing(tickets))


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
