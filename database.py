import sqlite3
import os, shutil
from datetime import date, datetime, timedelta

IS_VERCEL = "VERCEL" in os.environ or "AWS_LAMBDA_FUNCTION_NAME" in os.environ

if IS_VERCEL:
    DB_PATH = "/tmp/attendance.db"
    bundled_db = os.path.join(os.path.dirname(__file__), "attendance.db")
    if not os.path.exists(DB_PATH) and os.path.exists(bundled_db):
        try:
            shutil.copy2(bundled_db, DB_PATH)
        except Exception:
            pass
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "attendance.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Initialize the database schema."""
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS classes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                section TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(name, section)
            );

            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                roll_number TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
                email TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                photo TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late', 'Excused')),
                notes TEXT DEFAULT '',
                marked_at TEXT DEFAULT (datetime('now')),
                UNIQUE(student_id, date)
            );

            CREATE TABLE IF NOT EXISTS subjects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                code TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(name, class_id)
            );

            CREATE TABLE IF NOT EXISTS subject_attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late', 'Excused')),
                marked_at TEXT DEFAULT (datetime('now')),
                UNIQUE(student_id, subject_id, date)
            );

            CREATE TABLE IF NOT EXISTS holidays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'Holiday'
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                entity TEXT DEFAULT '',
                description TEXT DEFAULT '',
                timestamp TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS leaves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                from_date TEXT NOT NULL,
                to_date TEXT NOT NULL,
                reason TEXT DEFAULT '',
                status TEXT DEFAULT 'Approved' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'Teacher',
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        seed_default_users()


# ── Users & Auth ───────────────────────────────────────────────────────────────

from werkzeug.security import generate_password_hash, check_password_hash

def seed_default_users():
    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count == 0:
            conn.execute(
                "INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)",
                ("admin", generate_password_hash("admin123"), "System Administrator", "Admin")
            )
            conn.execute(
                "INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)",
                ("teacher", generate_password_hash("teacher123"), "Prof. Sharma", "Teacher")
            )

def get_user_by_username(username):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None

def get_user_by_id(user_id):
    with get_connection() as conn:
        row = conn.execute("SELECT id, username, name, role, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

def verify_user(username, password):
    user = get_user_by_username(username)
    if not user:
        return None
    if check_password_hash(user["password_hash"], password):
        return user
    return None


# ── Audit Log ──────────────────────────────────────────────────────────────────

def log_audit(action, entity="", description=""):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO audit_log (action, entity, description) VALUES (?, ?, ?)",
            (action, entity, description)
        )

def get_audit_log(limit=100):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, action, entity, description, timestamp FROM audit_log ORDER BY id DESC LIMIT ?",
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

def clear_audit_log():
    with get_connection() as conn:
        conn.execute("DELETE FROM audit_log")


# ── Classes ────────────────────────────────────────────────────────────────────

def get_all_classes():
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, name, section,
                      CASE WHEN section != '' THEN name || ' · ' || section ELSE name END AS display_name
               FROM classes ORDER BY name, section"""
        ).fetchall()
        return [dict(r) for r in rows]


def add_class(name, section=""):
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO classes (name, section) VALUES (?, ?)", (name, section)
        )
    log_audit("ADD", "Class", f"Added class: {name} {section}")
    return True


def delete_class(class_id):
    with get_connection() as conn:
        row = conn.execute("SELECT name FROM classes WHERE id=?", (class_id,)).fetchone()
        conn.execute("DELETE FROM classes WHERE id = ?", (class_id,))
    if row:
        log_audit("DELETE", "Class", f"Deleted class: {row['name']}")


# ── Subjects ───────────────────────────────────────────────────────────────────

def get_all_subjects(class_id=None):
    query = """
        SELECT s.id, s.name, s.code, s.class_id,
               CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name
        FROM subjects s LEFT JOIN classes c ON s.class_id = c.id
    """
    params = []
    if class_id:
        query += " WHERE s.class_id = ?"
        params.append(class_id)
    query += " ORDER BY c.name, s.name"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

def add_subject(name, class_id, code=""):
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO subjects (name, class_id, code) VALUES (?, ?, ?)",
            (name, class_id or None, code)
        )
    log_audit("ADD", "Subject", f"Added subject: {name}")
    return True

def delete_subject(subject_id):
    with get_connection() as conn:
        row = conn.execute("SELECT name FROM subjects WHERE id=?", (subject_id,)).fetchone()
        conn.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
    if row:
        log_audit("DELETE", "Subject", f"Deleted subject: {row['name']}")

def get_subject_attendance_for_date(subject_id, target_date, class_id=None):
    query = """
        SELECT s.id AS student_id, s.roll_number, s.name,
               COALESCE(sa.status, 'Not Marked') AS status,
               CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN subject_attendance sa ON sa.student_id = s.id AND sa.subject_id = ? AND sa.date = ?
    """
    params = [subject_id, target_date]
    if class_id:
        query += " WHERE s.class_id = ?"
        params.append(class_id)
    query += " ORDER BY s.roll_number"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

def mark_bulk_subject_attendance(records, subject_id, target_date):
    with get_connection() as conn:
        for rec in records:
            conn.execute(
                """INSERT INTO subject_attendance (student_id, subject_id, date, status)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(student_id, subject_id, date) DO UPDATE SET status=excluded.status""",
                (rec["student_id"], subject_id, target_date, rec["status"])
            )
    log_audit("MARK", "SubjectAttendance", f"Marked {len(records)} records for subject {subject_id} on {target_date}")

def get_student_subject_stats(student_id):
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT sub.id, sub.name AS subject_name,
                   COUNT(sa.id) AS total,
                   SUM(CASE WHEN sa.status='Present' THEN 1 ELSE 0 END) AS present,
                   SUM(CASE WHEN sa.status='Absent'  THEN 1 ELSE 0 END) AS absent,
                   SUM(CASE WHEN sa.status='Late'    THEN 1 ELSE 0 END) AS late
            FROM subjects sub
            LEFT JOIN subject_attendance sa ON sa.subject_id = sub.id AND sa.student_id = ?
            WHERE sub.class_id = (SELECT class_id FROM students WHERE id = ?)
            GROUP BY sub.id ORDER BY sub.name
        """, (student_id, student_id)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["percentage"] = round((d["present"] / d["total"] * 100), 1) if d["total"] > 0 else 0.0
            result.append(d)
        return result


# ── Students ───────────────────────────────────────────────────────────────────

def get_all_students(class_id=None):
    query = """
        SELECT s.id, s.roll_number, s.name, s.email, s.phone, s.photo,
               CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name,
               c.id AS class_id, s.created_at
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
    """
    params = []
    if class_id:
        query += " WHERE s.class_id = ?"
        params.append(class_id)
    query += " ORDER BY s.roll_number"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_student_by_id(student_id):
    with get_connection() as conn:
        row = conn.execute(
            """SELECT s.id, s.roll_number, s.name, s.email, s.phone, s.photo,
                      CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name,
                      c.id AS class_id, s.created_at
               FROM students s LEFT JOIN classes c ON s.class_id = c.id
               WHERE s.id = ?""",
            (student_id,)
        ).fetchone()
        return dict(row) if row else None


def add_student(roll_number, name, class_id=None, email="", phone="", photo=""):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO students (roll_number, name, class_id, email, phone, photo) VALUES (?, ?, ?, ?, ?, ?)",
            (roll_number, name, class_id or None, email, phone, photo)
        )
    log_audit("ADD", "Student", f"Added student: {name} ({roll_number})")
    return True


def update_student(student_id, roll_number, name, class_id=None, email="", phone="", photo=None):
    with get_connection() as conn:
        if photo is not None:
            conn.execute(
                "UPDATE students SET roll_number=?, name=?, class_id=?, email=?, phone=?, photo=? WHERE id=?",
                (roll_number, name, class_id or None, email, phone, photo, student_id)
            )
        else:
            conn.execute(
                "UPDATE students SET roll_number=?, name=?, class_id=?, email=?, phone=? WHERE id=?",
                (roll_number, name, class_id or None, email, phone, student_id)
            )
    log_audit("EDIT", "Student", f"Updated student ID {student_id}: {name}")


def update_student_photo(student_id, photo_path):
    with get_connection() as conn:
        conn.execute("UPDATE students SET photo=? WHERE id=?", (photo_path, student_id))


def delete_student(student_id):
    with get_connection() as conn:
        row = conn.execute("SELECT name, roll_number FROM students WHERE id=?", (student_id,)).fetchone()
        conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
    if row:
        log_audit("DELETE", "Student", f"Deleted student: {row['name']} ({row['roll_number']})")


def search_students(query_str):
    pattern = f"%{query_str}%"
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT s.id, s.roll_number, s.name,
                      CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name
               FROM students s LEFT JOIN classes c ON s.class_id = c.id
               WHERE s.name LIKE ? OR s.roll_number LIKE ?
               ORDER BY s.roll_number""",
            (pattern, pattern)
        ).fetchall()
        return [dict(r) for r in rows]

def bulk_import_students(rows):
    """rows: list of dicts with roll_number, name, class_name, email, phone"""
    classes_map = {c["display_name"]: c["id"] for c in get_all_classes()}
    # Also map by name+section
    for c in get_all_classes():
        classes_map[c["name"]] = c["id"]

    success, failed = 0, []
    with get_connection() as conn:
        for r in rows:
            try:
                class_id = classes_map.get(r.get("class_name", "").strip())
                conn.execute(
                    "INSERT INTO students (roll_number, name, class_id, email, phone) VALUES (?, ?, ?, ?, ?)",
                    (r["roll_number"].strip(), r["name"].strip(), class_id,
                     r.get("email", "").strip(), r.get("phone", "").strip())
                )
                success += 1
            except Exception as ex:
                failed.append({"row": r, "error": str(ex)})
    log_audit("IMPORT", "Student", f"Bulk imported {success} students, {len(failed)} failed")
    return success, failed


# ── Attendance ─────────────────────────────────────────────────────────────────

def get_attendance_for_date(target_date: str, class_id=None):
    query = """
        SELECT s.id AS student_id, s.roll_number, s.name,
               COALESCE(a.status, 'Not Marked') AS status,
               a.notes,
               CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name,
               c.id AS class_id
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
    """
    params = [target_date]
    if class_id:
        query += " WHERE s.class_id = ?"
        params.append(class_id)
    query += " ORDER BY s.roll_number"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def mark_attendance(student_id: int, target_date: str, status: str, notes: str = ""):
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO attendance (student_id, date, status, notes)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, notes=excluded.notes""",
            (student_id, target_date, status, notes)
        )


def mark_bulk_attendance(records: list, target_date: str):
    with get_connection() as conn:
        for rec in records:
            conn.execute(
                """INSERT INTO attendance (student_id, date, status, notes)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, notes=excluded.notes""",
                (rec["student_id"], target_date, rec["status"], rec.get("notes", ""))
            )
    log_audit("MARK", "Attendance", f"Bulk marked {len(records)} attendance records for {target_date}")


def get_student_attendance_history(student_id: int, limit: int = 90):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT date, status, notes FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT ?",
            (student_id, limit)
        ).fetchall()
        return [dict(r) for r in rows]


def get_student_stats(student_id: int):
    with get_connection() as conn:
        row = conn.execute(
            """SELECT COUNT(*) AS total,
                SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status='Absent'  THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN status='Late'    THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN status='Excused' THEN 1 ELSE 0 END) AS excused
               FROM attendance WHERE student_id = ?""",
            (student_id,)
        ).fetchone()
        total = row["total"] or 0
        present = row["present"] or 0
        pct = round((present / total) * 100, 1) if total > 0 else 0.0
        return {
            "total": total, "present": present,
            "absent": row["absent"] or 0,
            "late": row["late"] or 0,
            "excused": row["excused"] or 0,
            "percentage": pct
        }


# ── Holidays ───────────────────────────────────────────────────────────────────

def get_all_holidays():
    with get_connection() as conn:
        rows = conn.execute("SELECT id, date, name, type FROM holidays ORDER BY date").fetchall()
        return [dict(r) for r in rows]

def add_holiday(h_date, name, h_type="Holiday"):
    with get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO holidays (date, name, type) VALUES (?, ?, ?)",
            (h_date, name, h_type)
        )
    log_audit("ADD", "Holiday", f"Added holiday: {name} on {h_date}")

def delete_holiday(holiday_id):
    with get_connection() as conn:
        row = conn.execute("SELECT name, date FROM holidays WHERE id=?", (holiday_id,)).fetchone()
        conn.execute("DELETE FROM holidays WHERE id = ?", (holiday_id,))
    if row:
        log_audit("DELETE", "Holiday", f"Removed holiday: {row['name']} on {row['date']}")

def get_upcoming_holidays(n=5):
    today = date.today().isoformat()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, date, name, type FROM holidays WHERE date >= ? ORDER BY date LIMIT ?",
            (today, n)
        ).fetchall()
        return [dict(r) for r in rows]


# ── Leaves ─────────────────────────────────────────────────────────────────────

def get_all_leaves():
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT l.id, l.student_id, s.name AS student_name, s.roll_number,
                   CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name,
                   l.from_date, l.to_date, l.reason, l.status, l.created_at
            FROM leaves l
            JOIN students s ON l.student_id = s.id
            LEFT JOIN classes c ON s.class_id = c.id
            ORDER BY l.created_at DESC
        """).fetchall()
        return [dict(r) for r in rows]

def add_leave(student_id, from_date, to_date, reason="", status="Approved"):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO leaves (student_id, from_date, to_date, reason, status) VALUES (?, ?, ?, ?, ?)",
            (student_id, from_date, to_date, reason, status)
        )
    s = get_student_by_id(student_id)
    name = s["name"] if s else str(student_id)
    log_audit("ADD", "Leave", f"Leave added for {name}: {from_date} to {to_date}")

def update_leave_status(leave_id, status):
    with get_connection() as conn:
        conn.execute("UPDATE leaves SET status=? WHERE id=?", (status, leave_id))
    log_audit("EDIT", "Leave", f"Leave {leave_id} status changed to {status}")

def delete_leave(leave_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM leaves WHERE id=?", (leave_id,))
    log_audit("DELETE", "Leave", f"Deleted leave ID {leave_id}")

def apply_approved_leaves():
    """Auto-mark attendance as Excused for approved leave periods."""
    with get_connection() as conn:
        leaves = conn.execute(
            "SELECT * FROM leaves WHERE status='Approved'"
        ).fetchall()
        count = 0
        for lv in leaves:
            start = datetime.strptime(lv["from_date"], "%Y-%m-%d").date()
            end   = datetime.strptime(lv["to_date"],   "%Y-%m-%d").date()
            d = start
            while d <= end:
                if d.weekday() < 5:  # Skip weekends
                    conn.execute(
                        """INSERT INTO attendance (student_id, date, status, notes)
                           VALUES (?, ?, 'Excused', 'Auto: approved leave')
                           ON CONFLICT(student_id, date) DO UPDATE SET status='Excused', notes='Auto: approved leave'""",
                        (lv["student_id"], d.isoformat())
                    )
                    count += 1
                d += timedelta(days=1)
    log_audit("AUTO", "Leave", f"Applied approved leaves: {count} attendance records updated")
    return count


# ── Dashboard Stats ────────────────────────────────────────────────────────────

def get_dashboard_stats():
    today = date.today().isoformat()
    with get_connection() as conn:
        total_students = conn.execute("SELECT COUNT(*) FROM students").fetchone()[0]
        today_present = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE date=? AND status='Present'", (today,)
        ).fetchone()[0]
        today_absent = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE date=? AND status='Absent'", (today,)
        ).fetchone()[0]
        today_late = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE date=? AND status='Late'", (today,)
        ).fetchone()[0]
        today_marked = conn.execute(
            "SELECT COUNT(*) FROM attendance WHERE date=?", (today,)
        ).fetchone()[0]

        low_attendance = conn.execute("""
            SELECT s.name, s.roll_number,
                   CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name,
                   COUNT(a.id) AS total,
                   SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) AS present
            FROM students s
            LEFT JOIN classes c ON s.class_id = c.id
            LEFT JOIN attendance a ON a.student_id = s.id
            GROUP BY s.id
            HAVING total > 0 AND CAST(present AS FLOAT)/total < 0.75
            ORDER BY CAST(present AS FLOAT)/total ASC
            LIMIT 5
        """).fetchall()

        weekly = conn.execute("""
            SELECT date,
                   SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present,
                   COUNT(*) AS total
            FROM attendance
            WHERE date >= date('now', '-6 days')
            GROUP BY date ORDER BY date ASC
        """).fetchall()

    return {
        "total_students": total_students,
        "today_present": today_present,
        "today_absent": today_absent,
        "today_late": today_late,
        "today_marked": today_marked,
        "today_unmarked": total_students - today_marked,
        "today_rate": round((today_present / today_marked * 100), 1) if today_marked > 0 else 0,
        "low_attendance": [dict(r) for r in low_attendance],
        "weekly_trend": [dict(r) for r in weekly],
    }

def get_monthly_stats(months=6):
    """Return monthly attendance rates for the last N months."""
    with get_connection() as conn:
        rows = conn.execute("""
            SELECT strftime('%Y-%m', date) AS month,
                   COUNT(*) AS total,
                   SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present
            FROM attendance
            WHERE date >= date('now', ? || ' months')
            GROUP BY month ORDER BY month ASC
        """, (f"-{months}",)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["rate"] = round((d["present"] / d["total"] * 100), 1) if d["total"] > 0 else 0
            result.append(d)
        return result

def get_rankings(class_id=None, limit=10):
    """Get students ranked by attendance percentage."""
    query = """
        SELECT s.id, s.name, s.roll_number,
               CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name,
               COUNT(a.id) AS total,
               SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) AS present
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN attendance a ON a.student_id = s.id
    """
    params = []
    if class_id:
        query += " WHERE s.class_id = ?"
        params.append(class_id)
    query += " GROUP BY s.id HAVING total > 0 ORDER BY CAST(present AS FLOAT)/total DESC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        result = []
        for i, r in enumerate(rows):
            d = dict(r)
            d["rank"] = i + 1
            d["percentage"] = round((d["present"] / d["total"] * 100), 1) if d["total"] > 0 else 0
            result.append(d)
        return result


# ── Reports ────────────────────────────────────────────────────────────────────

def get_attendance_report(start_date: str, end_date: str, class_id=None):
    query = """
        SELECT s.roll_number, s.name,
               CASE WHEN c.section != '' THEN c.name || ' · ' || c.section ELSE c.name END AS class_name,
               COUNT(a.id) AS total_days,
               SUM(CASE WHEN a.status='Present' THEN 1 ELSE 0 END) AS present,
               SUM(CASE WHEN a.status='Absent'  THEN 1 ELSE 0 END) AS absent,
               SUM(CASE WHEN a.status='Late'    THEN 1 ELSE 0 END) AS late,
               SUM(CASE WHEN a.status='Excused' THEN 1 ELSE 0 END) AS excused
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN attendance a ON a.student_id = s.id AND a.date BETWEEN ? AND ?
    """
    params = [start_date, end_date]
    if class_id:
        query += " WHERE s.class_id = ?"
        params.append(class_id)
    query += " GROUP BY s.id ORDER BY s.roll_number"
    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["percentage"] = round((d["present"] / d["total_days"] * 100), 1) if d["total_days"] > 0 else 0.0
            result.append(d)
        return result
