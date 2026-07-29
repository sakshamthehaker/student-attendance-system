import sqlite3

db_path = r"C:\Users\saksham tandon\.gemini\antigravity\scratch\student_attendance_system\attendance.db"
conn = sqlite3.connect(db_path)

# Add photo column if missing
try:
    conn.execute('ALTER TABLE students ADD COLUMN photo TEXT DEFAULT ""')
    print("Added photo column")
except Exception as e:
    print(f"photo column: {e}")

# Create all new tables
conn.executescript("""
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
        status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Excused')),
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
        status TEXT DEFAULT 'Approved' CHECK(status IN ('Pending','Approved','Rejected')),
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

conn.commit()
conn.close()

import database as db
db.seed_default_users()
print("Migration & user seeding complete!")
