"""
seed_data.py - Populate the database with demo students, classes, and attendance records.
Run once before starting the app: python seed_data.py
"""
import database as db
from datetime import date, timedelta
import random

db.init_db()

# ── Classes ────────────────────────────────────────────────────────────────────
classes = [
    ("B.Tech CSE", "Sem 1 - Section A"),
    ("B.Tech CSE", "Sem 1 - Section B"),
    ("B.Tech CSE", "Sem 3 - Section A"),
    ("B.Tech CSE", "Sem 3 - Section B"),
]
for name, section in classes:
    try:
        db.add_class(name, section)
    except Exception:
        pass  # already exists

all_classes = {c["section"]: c["id"] for c in db.get_all_classes()}

# ── Students ───────────────────────────────────────────────────────────────────
students_data = [
    # Sem 1 - Section A
    ("1001", "Aarav Sharma",    "Sem 1 - Section A", "aarav@college.edu",    "9876543201"),
    ("1002", "Priya Patel",     "Sem 1 - Section A", "priya@college.edu",    "9876543202"),
    ("1003", "Rohan Mehta",     "Sem 1 - Section A", "rohan@college.edu",    "9876543203"),
    ("1004", "Sneha Gupta",     "Sem 1 - Section A", "sneha@college.edu",    "9876543204"),
    ("1005", "Karan Singh",     "Sem 1 - Section A", "karan@college.edu",    "9876543205"),
    ("1006", "Neha Joshi",      "Sem 1 - Section A", "neha@college.edu",     "9876543206"),
    # Sem 1 - Section B
    ("1007", "Aditya Kumar",    "Sem 1 - Section B", "aditya@college.edu",   "9876543207"),
    ("1008", "Divya Nair",      "Sem 1 - Section B", "divya@college.edu",    "9876543208"),
    ("1009", "Vikram Reddy",    "Sem 1 - Section B", "vikram@college.edu",   "9876543209"),
    ("1010", "Pooja Verma",     "Sem 1 - Section B", "pooja@college.edu",    "9876543210"),
    # Sem 3 - Section A
    ("1101", "Arjun Bose",      "Sem 3 - Section A", "arjun@college.edu",    "9876543211"),
    ("1102", "Kavya Menon",     "Sem 3 - Section A", "kavya@college.edu",    "9876543212"),
    ("1103", "Rahul Das",       "Sem 3 - Section A", "rahul@college.edu",    "9876543213"),
    ("1104", "Ananya Iyer",     "Sem 3 - Section A", "ananya@college.edu",   "9876543214"),
    ("1105", "Siddharth Rao",   "Sem 3 - Section A", "siddharth@college.edu","9876543215"),
    # Sem 3 - Section B
    ("1106", "Meera Pillai",    "Sem 3 - Section B", "meera@college.edu",    "9876543216"),
    ("1107", "Tejas Patil",     "Sem 3 - Section B", "tejas@college.edu",    "9876543217"),
    ("1108", "Shruti Malhotra", "Sem 3 - Section B", "shruti@college.edu",   "9876543218"),
    ("1109", "Ishaan Chopra",   "Sem 3 - Section B", "ishaan@college.edu",   "9876543219"),
    ("1110", "Riya Choudhary",  "Sem 3 - Section B", "riya@college.edu",     "9876543220"),
]

for roll, name, section_key, email, phone in students_data:
    try:
        db.add_student(roll, name, all_classes.get(section_key), email, phone)
    except Exception:
        pass  # already exists

all_students = db.get_all_students()

# ── Attendance History (last 30 days) ──────────────────────────────────────────
today = date.today()
statuses = ["Present", "Present", "Present", "Present", "Absent", "Late", "Excused"]

# Give some students lower attendance to trigger low-attendance warnings
low_attendance_ids = set()
for s in all_students[:3]:
    low_attendance_ids.add(s["id"])

for day_offset in range(29, -1, -1):
    target_date = (today - timedelta(days=day_offset)).isoformat()
    # Skip weekends
    d = today - timedelta(days=day_offset)
    if d.weekday() >= 5:
        continue

    records = []
    for student in all_students:
        if student["id"] in low_attendance_ids:
            # 50% chance of being present → triggers low attendance alert
            weights = ["Present", "Absent", "Absent", "Late"]
            status = random.choice(weights)
        else:
            status = random.choice(statuses)
        records.append({"student_id": student["id"], "status": status, "notes": ""})

    db.mark_bulk_attendance(records, target_date)

print(f"[OK] Seeded {len(all_students)} students across {len(classes)} classes with 30 days of attendance data.")
