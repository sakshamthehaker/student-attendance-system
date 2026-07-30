# 🎓 EduTrack – Student Attendance System

![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Framework-Flask_3.0-green.svg?logo=flask&logoColor=white)
![Database](https://img.shields.io/badge/Database-SQLite%2FPostgreSQL-blue?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-purple.svg)
![Deployment](https://img.shields.io/badge/Deployed-Vercel%20%7C%20Railway-black?logo=vercel&logoColor=white)

> A modern, full-stack, responsive web application for managing student attendance, tracking subject-wise progress, automating leave requests, generating student QR passes, and exporting analytics reports.

---

## 🌟 Key Features

### 📅 Attendance & Subject Management
- **Daily & Subject-Wise Marking**: Mark attendance for general classes or specific subjects (`Present`, `Absent`, `Late`, `Excused`).
- **1-Click Bulk Marking**: Mark all students in a class with one click.
- **⌨️ Speed Keyboard Navigation**: Fast marking using `↑` / `↓` arrow keys and `P`, `A`, `L`, `E` hotkeys.
- **↩️ 6-Second Undo Toast**: Revert accidental saves within 6 seconds with a visual progress bar.

### 📊 Real-Time Analytics & Insights
- **6-Month Attendance Trends**: Interactive bar and line charts built with Chart.js.
- **📅 90-Day Attendance Heatmap**: GitHub-style green/yellow/red calendar visualization per student.
- **🏆 Student Leaderboard**: Gold, Silver, and Bronze ranking medals for top-performing students.
- **⚠️ Defaulter Tracking**: Automated highlight alerts for students falling below 75% attendance.

### 📋 Leaves, Holidays & Audit Logging
- **Leave Application Workflow**: Apply for student leaves, approve/reject requests, and auto-apply `Excused` status.
- **Holiday & Exam Exclusions**: Manage national holidays and exam days to preserve accurate attendance percentages.
- **📝 System Audit Trail**: Complete event logging for all CRUD operations, imports, and user logins.

### 🔲 QR Codes & Data Export
- **Student QR ID Pass**: Instantly generate and download PNG QR passes containing formatted vCard / profile URLs.
- **📊 Excel (`.xlsx`) Export**: Download color-coded spreadsheets with attendance percentage indicators.
- **📥 CSV Bulk Import**: Add hundreds of students at once via CSV upload with auto-template download.
- **💾 1-Click Database Backup**: Download full `.db` database snapshots for offline data security.

### 🔐 Security & User Experience
- **Role-Based Authentication**: Secure login with password hashing (`Werkzeug`) for **Admin** and **Teacher** roles.
- **☀️/🌙 Light & Dark Theme**: Built-in 1-click theme switcher with smooth transitions.
- **📱 Fully Responsive UI**: Desktop grid layouts and mobile drawer drawer overlays.

---

## 🛠️ Technical Stack

| Layer | Technologies Used |
|---|---|
| **Frontend** | HTML5, CSS3 Variables, JavaScript ES6+, Chart.js |
| **Backend** | Python 3, Flask, Werkzeug Security |
| **Database** | SQLite3 (Composite constraints, foreign keys) / PostgreSQL |
| **Export/QR** | OpenPyXL (Excel generation), QRCode, Pillow |
| **Deployment** | Vercel (Serverless), Railway / Render |

---

## 🚀 Quick Start (Local Setup)

### 1. Clone the Repository
```bash
git clone https://github.com/sakshamthehaker/student-attendance-system.git
cd student-attendance-system
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run Database Migrations & Seed Sample Data
```bash
python migrate.py
python seed_data.py
```

### 4. Start the Application
```bash
python app.py
```
Open your browser at **`http://127.0.0.1:5000`**

---

## 🔑 Default Login Credentials

| Role | Username | Password |
|---|---|---|
| **Admin** | `admin` | `admin123` |
| **Teacher** | `teacher` | `teacher123` |

---

## 📡 API Reference Overview

| Endpoint | Method | Description |
|---|---|---|
| `/api/dashboard` | `GET` | Fetch overall summary stats & low-attendance list |
| `/api/attendance` | `GET` / `POST` | Get or mark student attendance records |
| `/api/students` | `GET` / `POST` | List, search, or add student profiles |
| `/api/students/<id>/qr` | `GET` | Download student QR code pass (PNG) |
| `/api/subjects` | `GET` / `POST` | Manage subject registry per class |
| `/api/leaves` | `GET` / `POST` | Manage leave applications and approvals |
| `/api/reports/export-excel` | `GET` | Export formatted Excel report (`.xlsx`) |
| `/api/backup` | `GET` | Download full database backup (`.db`) |

---

## 📄 License
Distributed under the **MIT License**. See `LICENSE` for more information.

---

### 👤 Author
**Saksham** – [@sakshamthehaker](https://github.com/sakshamthehaker)
