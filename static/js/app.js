/* ════════════════════════════════════════════════════════════
   EduTrack – Complete Frontend Application
   All 11 features: Monthly Chart, Rankings, Heatmap,
   Excel Export, DB Backup, Bulk Import, Holidays,
   QR Codes, Subjects, Audit Log, Leave Management
   ════════════════════════════════════════════════════════════ */
"use strict";

// ── Global State ─────────────────────────────────────────────────────────────
let allClasses      = [];
let allStudents     = [];
let attendanceData  = [];
let weeklyChart     = null;
let donutChart      = null;
let monthlyChart    = null;

// Pagination
let allStudentsData = [];
let currentPage     = 1;
let pageSize        = 10;

// Keyboard shortcuts
let focusedRowIndex = -1;
let attRowIds       = [];

// Undo
let undoInterval       = null;
let prevAttStatusMap   = null;
let lastSavedDate      = null;

// Subject attendance
let activeSubjectId   = null;
let subjectAttData    = [];

// ── API Helper ────────────────────────────────────────────────────────────────
async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Utility Helpers ────────────────────────────────────────────────────────────
function toast(msg, type = "info", duration = 3200) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => { el.className = "toast"; }, duration);
}
function fmt(n) { return n ?? "—"; }
function pctClass(p) { return p >= 75 ? "good" : p >= 50 ? "warn" : "danger"; }
function pctColor(p) {
  return p >= 75 ? "var(--accent-green)" : p >= 50 ? "var(--accent-yellow)" : "var(--accent-red)";
}
function todayISO() { return new Date().toISOString().split("T")[0]; }
function firstMonthDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
function dayName(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });
}
function isDarkMode() { return !document.body.classList.contains("light-mode"); }
function getChartTheme() {
  const dark = isDarkMode();
  return {
    grid:    dark ? "#2a3447" : "#e1e8ef",
    tick:    dark ? "#8b949e" : "#6b7280",
    tipBg:   dark ? "#1c2230" : "#ffffff",
    tipBdr:  dark ? "#2a3447" : "#e1e8ef",
    tipHead: dark ? "#e6edf3" : "#1f2328",
    tipBody: dark ? "#8b949e" : "#6b7280",
  };
}

// ══════════════════════════════════════════════════════════════
// THEME TOGGLE
// ══════════════════════════════════════════════════════════════
function applyTheme(isLight) {
  document.body.classList.toggle("light-mode", isLight);
  document.getElementById("themeIcon").textContent = isLight ? "🌙" : "☀️";
  localStorage.setItem("edutrack-theme", isLight ? "light" : "dark");
  if (document.getElementById("view-dashboard").classList.contains("active")) loadDashboard();
}
document.getElementById("themeToggle").addEventListener("click", () => applyTheme(isDarkMode()));
(function restoreTheme() {
  if (localStorage.getItem("edutrack-theme") === "light") applyTheme(true);
})();

// ── Sidebar Date ──────────────────────────────────────────────────────────────
document.getElementById("sidebarDate").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", year: "numeric", month: "long", day: "numeric"
});

// ══════════════════════════════════════════════════════════════
// MOBILE SIDEBAR
// ══════════════════════════════════════════════════════════════
function openSidebar()  {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.add("visible");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("visible");
}
document.getElementById("hamburgerBtn").addEventListener("click", openSidebar);
document.getElementById("sidebarToggle").addEventListener("click", closeSidebar);
document.getElementById("sidebarOverlay").addEventListener("click", closeSidebar);
document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => {
  if (window.innerWidth <= 768) closeSidebar();
}));

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
const VIEWS = ["dashboard","attendance","students","subjects","leaves","holidays","reports","classes","audit"];
const TITLES = {
  dashboard:  "📊 Dashboard",
  attendance: "✅ Mark Attendance",
  students:   "👥 Students",
  subjects:   "📚 Subjects",
  leaves:     "📋 Leave Management",
  holidays:   "🗓️ Holidays",
  reports:    "📈 Reports",
  classes:    "🏫 Classes",
  audit:      "📝 Audit Log",
};

function switchView(name) {
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle("active", v === name);
    document.getElementById(`nav-${v}`).classList.toggle("active", v === name);
  });
  document.getElementById("pageTitle").textContent = TITLES[name];
  focusedRowIndex = -1; attRowIds = [];
  if (name === "dashboard")  loadDashboard();
  if (name === "attendance") initAttendanceView();
  if (name === "students")   loadStudents();
  if (name === "subjects")   loadSubjects();
  if (name === "leaves")     loadLeaves();
  if (name === "holidays")   loadHolidays();
  if (name === "reports")    initReportsView();
  if (name === "classes")    loadClasses();
  if (name === "audit")      loadAuditLog();
}
document.querySelectorAll(".nav-item").forEach(btn =>
  btn.addEventListener("click", () => switchView(btn.dataset.view))
);

// ══════════════════════════════════════════════════════════════
// CLASSES
// ══════════════════════════════════════════════════════════════
async function loadClasses() {
  allClasses = await api("/api/classes");
  renderClassGrid(allClasses);
  populateClassSelects();
}

function populateClassSelects() {
  const ids = ["attClass","studentClassFilter","reportClass","fClass","fSubjectClass","subjectClassFilter"];
  ids.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = id === "fClass" || id === "fSubjectClass"
      ? '<option value="">— Select Class —</option>'
      : '<option value="">All Classes</option>';
    allClasses.forEach(c => {
      const o = document.createElement("option");
      o.value = c.id; o.textContent = c.display_name || c.name;
      sel.appendChild(o);
    });
    sel.value = cur;
  });
}

function renderClassGrid(classes) {
  const grid = document.getElementById("classGrid");
  if (!classes.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏫</div><div class="empty-state-text">No classes yet.</div></div>`;
    return;
  }
  grid.innerHTML = classes.map(c => `
    <div class="class-card" id="class-card-${c.id}">
      <div class="class-card-name">${c.display_name || c.name}</div>
      ${c.section ? `<div class="class-card-section">${c.section}</div>` : ""}
      <div class="class-card-count" id="class-count-${c.id}">Loading…</div>
      <div class="class-card-actions">
        <button class="btn btn-danger btn-sm" onclick="deleteClass(${c.id})">🗑 Remove</button>
      </div>
    </div>`).join("");
  classes.forEach(async c => {
    const s = await api(`/api/students?class_id=${c.id}`);
    const el = document.getElementById(`class-count-${c.id}`);
    if (el) el.textContent = `${s.length} student${s.length !== 1 ? "s" : ""}`;
  });
}

document.getElementById("addClassBtn").addEventListener("click", () => openModal("classModal"));
document.getElementById("classForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = document.getElementById("fClassName").value.trim();
  const section = document.getElementById("fClassSection").value.trim();
  if (!name) return;
  try {
    await api("/api/classes", { method: "POST", body: JSON.stringify({ name, section }) });
    toast(`Class "${name}" added!`, "success");
    closeModal("classModal");
    document.getElementById("classForm").reset();
    await loadClasses();
  } catch (e) { toast(e.message, "error"); }
});

async function deleteClass(id) {
  if (!confirm("Delete this class? Students will be unassigned.")) return;
  await api(`/api/classes/${id}`, { method: "DELETE" });
  toast("Class removed", "info");
  loadClasses();
}
window.deleteClass = deleteClass;

// ══════════════════════════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }
window.openModal = openModal; window.closeModal = closeModal;
document.querySelectorAll(".modal-overlay").forEach(o =>
  o.addEventListener("click", e => { if (e.target === o) o.classList.remove("open"); })
);

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function loadDashboard() {
  const [stats, monthly, rankings, upcoming] = await Promise.all([
    api("/api/dashboard"),
    api("/api/stats/monthly?months=6"),
    api("/api/stats/rankings?limit=5"),
    api("/api/holidays/upcoming"),
  ]);

  document.getElementById("stat-total").textContent   = fmt(stats.total_students);
  document.getElementById("stat-present").textContent = fmt(stats.today_present);
  document.getElementById("stat-absent").textContent  = fmt(stats.today_absent);
  document.getElementById("stat-late").textContent    = fmt(stats.today_late);
  document.getElementById("stat-rate").textContent    = stats.today_marked > 0 ? `${stats.today_rate}%` : "—";

  renderLowAttendance(stats.low_attendance);
  renderWeeklyChart(stats.weekly_trend);
  renderTodayDonut(stats);
  renderMonthlyChart(monthly);
  renderRankings(rankings);
  renderUpcomingHolidays(upcoming);
}

function renderLowAttendance(list) {
  const el = document.getElementById("lowAttendanceList");
  document.getElementById("lowCount").textContent = list.length;
  if (!list.length) {
    el.innerHTML = `<div class="low-empty">🎉 All students are above 75%!</div>`; return;
  }
  el.innerHTML = list.map(s => {
    const pct = s.total > 0 ? Math.round(s.present / s.total * 100) : 0;
    return `<div class="low-item">
      <div class="low-item-avatar">${s.name.charAt(0)}</div>
      <div class="low-item-info">
        <div class="low-item-name">${s.name}</div>
        <div class="low-item-meta">${s.roll_number} · ${s.class_name || "Unassigned"}</div>
      </div>
      <div class="low-item-pct" style="color:var(--accent-red)">${pct}%</div>
    </div>`;
  }).join("");
}

function renderRankings(list) {
  const el = document.getElementById("rankingsList");
  if (!list.length) {
    el.innerHTML = `<div class="low-empty">No attendance data yet.</div>`; return;
  }
  el.innerHTML = list.map(s => {
    const rankCls = s.rank === 1 ? "r1" : s.rank === 2 ? "r2" : s.rank === 3 ? "r3" : "rn";
    return `<div class="ranking-item">
      <div class="rank-badge ${rankCls}">${s.rank}</div>
      <div class="ranking-info">
        <div class="ranking-name">${s.name}</div>
        <div class="ranking-meta">${s.roll_number} · ${s.class_name || "—"}</div>
      </div>
      <div class="ranking-pct">${s.percentage}%</div>
    </div>`;
  }).join("");
}

function renderUpcomingHolidays(list) {
  const card = document.getElementById("upcomingHolidaysCard");
  const el = document.getElementById("upcomingHolidaysList");
  if (!list.length) { card.style.display = "none"; return; }
  card.style.display = "block";
  el.innerHTML = list.map(h => `
    <div class="holiday-chip">
      <span class="holiday-chip-date">${formatDateShort(h.date)}</span>
      <span class="holiday-chip-name">${h.name}</span>
      <span class="holiday-chip-type">${h.type}</span>
    </div>`).join("");
}

function renderWeeklyChart(trend) {
  const ctx = document.getElementById("weeklyChart").getContext("2d");
  const th = getChartTheme();
  if (weeklyChart) weeklyChart.destroy();
  weeklyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trend.map(t => formatDateShort(t.date)),
      datasets: [{
        label: "Attendance %",
        data: trend.map(t => t.total > 0 ? Math.round(t.present / t.total * 100) : 0),
        borderColor: "#2f81f7", backgroundColor: "rgba(47,129,247,0.1)",
        borderWidth: 2.5, fill: true, tension: 0.4,
        pointBackgroundColor: "#2f81f7", pointRadius: 4, pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: th.tipBg, borderColor: th.tipBdr, borderWidth: 1, titleColor: th.tipHead, bodyColor: th.tipBody, callbacks: { label: c => ` ${c.parsed.y}%` } } },
      scales: {
        x: { grid: { color: th.grid }, ticks: { color: th.tick, font: { size: 11 } } },
        y: { min: 0, max: 100, grid: { color: th.grid }, ticks: { color: th.tick, font: { size: 11 }, callback: v => v + "%" } }
      }
    }
  });
}

function renderTodayDonut(data) {
  const ctx = document.getElementById("todayDonut").getContext("2d");
  const th = getChartTheme();
  const excused = Math.max(0, data.today_marked - data.today_present - data.today_absent - data.today_late);
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Present","Absent","Late","Excused"],
      datasets: [{ data: [data.today_present, data.today_absent, data.today_late, excused],
        backgroundColor: ["#3fb950cc","#f85149cc","#d29922cc","#a371f7cc"],
        borderColor: ["#3fb950","#f85149","#d29922","#a371f7"],
        borderWidth: 2, hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { color: th.tick, padding: 12, font: { size: 11 }, boxWidth: 12 } },
        tooltip: { backgroundColor: th.tipBg, borderColor: th.tipBdr, borderWidth: 1, titleColor: th.tipHead, bodyColor: th.tipBody }
      }
    }
  });
}

function renderMonthlyChart(monthly) {
  const ctx = document.getElementById("monthlyChart").getContext("2d");
  const th = getChartTheme();
  if (monthlyChart) monthlyChart.destroy();
  const labels = monthly.map(m => {
    const [y, mo] = m.month.split("-");
    return new Date(+y, +mo - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  });
  monthlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Attendance %",
        data: monthly.map(m => m.rate),
        backgroundColor: monthly.map(m => m.rate >= 75 ? "rgba(63,185,80,0.7)" : m.rate >= 50 ? "rgba(210,153,34,0.7)" : "rgba(248,81,73,0.7)"),
        borderColor:     monthly.map(m => m.rate >= 75 ? "#3fb950" : m.rate >= 50 ? "#d29922" : "#f85149"),
        borderWidth: 2, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: th.tipBg, borderColor: th.tipBdr, borderWidth: 1, titleColor: th.tipHead, bodyColor: th.tipBody, callbacks: { label: c => ` ${c.parsed.y}%` } } },
      scales: {
        x: { grid: { color: th.grid }, ticks: { color: th.tick } },
        y: { min: 0, max: 100, grid: { color: th.grid }, ticks: { color: th.tick, callback: v => v + "%" } }
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ATTENDANCE VIEW
// ══════════════════════════════════════════════════════════════
function initAttendanceView() {
  if (!document.getElementById("attDate").value)
    document.getElementById("attDate").value = todayISO();
  // populate subject dropdown from selected class
  populateSubjectSelect();
}

async function populateSubjectSelect(classId) {
  const sel = document.getElementById("attSubject");
  const cid = classId || document.getElementById("attClass").value;
  sel.innerHTML = '<option value="">— Daily (Overall) —</option>';
  const subjects = await api(`/api/subjects${cid ? "?class_id=" + cid : ""}`);
  subjects.forEach(s => {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = `${s.name}${s.code ? " (" + s.code + ")" : ""} · ${s.class_name}`;
    sel.appendChild(o);
  });
}

document.getElementById("attClass").addEventListener("change", e => {
  populateSubjectSelect(e.target.value);
});

document.getElementById("loadAttBtn").addEventListener("click", loadAttendance);
document.getElementById("attDate").addEventListener("keydown", e => { if (e.key === "Enter") loadAttendance(); });

async function loadAttendance() {
  const date    = document.getElementById("attDate").value;
  const classId = document.getElementById("attClass").value;
  const subjectId = document.getElementById("attSubject").value;
  if (!date) { toast("Please select a date", "error"); return; }

  const card  = document.getElementById("attendanceTableCard");
  const tbody = document.getElementById("attendanceTbody");
  tbody.innerHTML = `<tr><td colspan="6"><div class="loading"><div class="spinner"></div> Loading…</div></td></tr>`;
  card.style.display = "block";
  document.getElementById("bulkActions").style.display = "flex";
  focusedRowIndex = -1; attRowIds = [];

  if (subjectId) {
    attendanceData = await api(`/api/subjects/${subjectId}/attendance?date=${date}${classId ? "&class_id=" + classId : ""}`);
    document.getElementById("attTableTitle").textContent = `Subject Attendance — ${formatDateShort(date)}`;
    // Re-use the same save handler but route to subject endpoint
    window._currentAttMode = "subject";
    window._currentSubjectId = subjectId;
  } else {
    attendanceData = await api(`/api/attendance?date=${date}${classId ? "&class_id=" + classId : ""}`);
    document.getElementById("attTableTitle").textContent = `Daily Attendance — ${formatDateShort(date)}`;
    window._currentAttMode = "daily";
    window._currentSubjectId = null;
  }
  renderAttendanceTable(attendanceData, date);
}

function renderAttendanceTable(data, date) {
  const tbody   = document.getElementById("attendanceTbody");
  const summary = document.getElementById("attSummary");
  const present = data.filter(s => s.status === "Present").length;
  const marked  = data.filter(s => s.status !== "Not Marked").length;
  summary.textContent = `${marked}/${data.length} marked · ${present} present`;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No students found.</div></div></td></tr>`;
    return;
  }
  attRowIds = data.map(s => s.student_id);
  window._attStatusMap = {};
  window._originalAttStatusMap = {};
  data.forEach(s => {
    const st = s.status === "Not Marked" ? "Absent" : s.status;
    window._attStatusMap[s.student_id] = st;
    window._originalAttStatusMap[s.student_id] = st;
  });
  tbody.innerHTML = data.map((s, i) => {
    const cur = s.status === "Not Marked" ? "" : s.status;
    return `<tr id="att-row-${s.student_id}" data-idx="${i}" onclick="focusRow(${i})">
      <td>${i + 1}</td>
      <td><span class="roll-badge">${s.roll_number}</span></td>
      <td><strong>${s.name}</strong></td>
      <td>${s.class_name || "—"}</td>
      <td>
        <div class="status-toggle" id="toggle-${s.student_id}">
          <button class="status-btn ${cur === "Present" ? "active-P":""}" onclick="setStatus(${s.student_id},'Present',this)">✅ P</button>
          <button class="status-btn ${cur === "Absent"  ? "active-A":""}" onclick="setStatus(${s.student_id},'Absent', this)">❌ A</button>
          <button class="status-btn ${cur === "Late"    ? "active-L":""}" onclick="setStatus(${s.student_id},'Late',   this)">⏰ L</button>
          <button class="status-btn ${cur === "Excused" ? "active-E":""}" onclick="setStatus(${s.student_id},'Excused',this)">🔖 E</button>
        </div>
      </td>
      <td><input type="text" class="notes-input" id="notes-${s.student_id}" placeholder="Optional note…" value="${s.notes||""}" /></td>
    </tr>`;
  }).join("");
}

function setStatus(sid, status, btn) {
  const toggle = document.getElementById(`toggle-${sid}`);
  toggle.querySelectorAll(".status-btn").forEach(b => b.className = "status-btn");
  const map = { Present:"active-P", Absent:"active-A", Late:"active-L", Excused:"active-E" };
  btn.className = `status-btn ${map[status]}`;
  window._attStatusMap[sid] = status;
}
window.setStatus = setStatus;

function markAllAs(status) {
  const map  = { Present:"active-P", Absent:"active-A", Late:"active-L", Excused:"active-E" };
  const idxs = { Present:0, Absent:1, Late:2, Excused:3 };
  attendanceData.forEach(s => {
    const toggle = document.getElementById(`toggle-${s.student_id}`);
    if (!toggle) return;
    toggle.querySelectorAll(".status-btn").forEach(b => b.className = "status-btn");
    toggle.querySelectorAll(".status-btn")[idxs[status]].className = `status-btn ${map[status]}`;
    window._attStatusMap[s.student_id] = status;
  });
}
window.markAllAs = markAllAs;

function focusRow(idx) { focusedRowIndex = idx; highlightFocusedRow(); }
window.focusRow = focusRow;

function highlightFocusedRow() {
  document.querySelectorAll(".att-row-focused").forEach(r => r.classList.remove("att-row-focused"));
  if (focusedRowIndex < 0 || focusedRowIndex >= attRowIds.length) return;
  const row = document.getElementById(`att-row-${attRowIds[focusedRowIndex]}`);
  if (row) { row.classList.add("att-row-focused"); row.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
}

function markFocusedRow(status) {
  if (focusedRowIndex < 0) return;
  const sid = attRowIds[focusedRowIndex];
  const toggle = document.getElementById(`toggle-${sid}`);
  if (!toggle) return;
  const map  = { Present:"active-P", Absent:"active-A", Late:"active-L", Excused:"active-E" };
  const idxs = { Present:0, Absent:1, Late:2, Excused:3 };
  toggle.querySelectorAll(".status-btn").forEach(b => b.className = "status-btn");
  toggle.querySelectorAll(".status-btn")[idxs[status]].className = `status-btn ${map[status]}`;
  window._attStatusMap[sid] = status;
}

// Save attendance (daily OR subject)
document.getElementById("saveAttBtn").addEventListener("click", async () => {
  const date = document.getElementById("attDate").value;
  if (!date) return;
  prevAttStatusMap = { ...window._originalAttStatusMap };
  lastSavedDate    = date;
  const records = attendanceData.map(s => ({
    student_id: s.student_id,
    status: window._attStatusMap[s.student_id] || "Absent",
    notes: document.getElementById(`notes-${s.student_id}`)?.value || ""
  }));
  try {
    let res;
    if (window._currentAttMode === "subject" && window._currentSubjectId) {
      res = await api(`/api/subjects/${window._currentSubjectId}/attendance/mark`, {
        method: "POST", body: JSON.stringify({ date, records })
      });
    } else {
      res = await api("/api/attendance/mark", { method: "POST", body: JSON.stringify({ date, records }) });
    }
    window._originalAttStatusMap = { ...window._attStatusMap };
    showUndoToast(`Saved ${res.marked} students`);
  } catch (err) { toast(err.message, "error"); }
});

// ══════════════════════════════════════════════════════════════
// UNDO TOAST
// ══════════════════════════════════════════════════════════════
function showUndoToast(msg) {
  const el  = document.getElementById("undoToast");
  const bar = document.getElementById("undoProgressBar");
  const DURATION = 6000;
  document.getElementById("undoMsg").textContent = msg;
  bar.style.transition = "none"; bar.style.width = "100%";
  el.classList.add("show");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `width ${DURATION}ms linear`; bar.style.width = "0%";
  }));
  if (undoInterval) clearTimeout(undoInterval);
  undoInterval = setTimeout(() => { el.classList.remove("show"); prevAttStatusMap = null; }, DURATION);
}
document.getElementById("undoBtn").addEventListener("click", async () => {
  if (!prevAttStatusMap || !lastSavedDate) return;
  clearTimeout(undoInterval);
  document.getElementById("undoToast").classList.remove("show");
  const records = attendanceData.map(s => ({
    student_id: s.student_id,
    status: prevAttStatusMap[s.student_id] || "Absent",
    notes: ""
  }));
  try {
    await api("/api/attendance/mark", { method: "POST", body: JSON.stringify({ date: lastSavedDate, records }) });
    await loadAttendance();
    toast("↩ Attendance reverted!", "info");
  } catch (err) { toast(err.message, "error"); }
  prevAttStatusMap = null;
});

// ══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════
document.addEventListener("keydown", e => {
  const inInput = ["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName);
  if (e.key === "?" && !inInput) { openModal("shortcutsModal"); return; }
  if (e.key === "Escape") { document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open")); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    if (document.getElementById("view-attendance").classList.contains("active"))
      document.getElementById("saveAttBtn").click();
    return;
  }
  if (!document.getElementById("view-attendance").classList.contains("active")) return;
  if (!attendanceData.length || inInput) return;
  switch (e.key) {
    case "ArrowDown": case "j": e.preventDefault(); focusedRowIndex = Math.min(focusedRowIndex + 1, attRowIds.length - 1); if (focusedRowIndex < 0) focusedRowIndex = 0; highlightFocusedRow(); break;
    case "ArrowUp":  case "k": e.preventDefault(); focusedRowIndex = Math.max(focusedRowIndex - 1, 0); highlightFocusedRow(); break;
    case "p": case "P": markFocusedRow("Present"); break;
    case "a": case "A": markFocusedRow("Absent");  break;
    case "l": case "L": markFocusedRow("Late");    break;
    case "e": case "E": markFocusedRow("Excused"); break;
    case "s": case "S": document.getElementById("saveAttBtn").click(); break;
  }
});

// ══════════════════════════════════════════════════════════════
// STUDENTS (with pagination)
// ══════════════════════════════════════════════════════════════
async function loadStudents() {
  const classId = document.getElementById("studentClassFilter").value;
  allStudentsData = await api(`/api/students${classId ? "?class_id=" + classId : ""}`);
  currentPage = 1;
  renderStudentsPage();
}

function renderStudentsPage() {
  const start = (currentPage - 1) * pageSize;
  const pageStudents = allStudentsData.slice(start, start + pageSize);
  renderStudentsTable(pageStudents);
  updatePaginationUI();
}

async function renderStudentsTable(students) {
  const tbody = document.getElementById("studentsTbody");
  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No students found.</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = students.map(s => `
    <tr id="student-row-${s.id}">
      <td><span class="roll-badge">${s.roll_number}</span></td>
      <td><strong>${s.name}</strong></td>
      <td>${s.class_name || '<em style="color:var(--text-muted)">Unassigned</em>'}</td>
      <td style="color:var(--text-secondary)">${s.email || "—"}</td>
      <td id="pct-cell-${s.id}"><div class="loading" style="padding:4px;justify-content:flex-start;gap:6px;"><div class="spinner" style="width:12px;height:12px;border-width:1.5px;"></div></div></td>
      <td>
        <button class="btn-icon" title="View" onclick="viewStudent(${s.id})">👁</button>
        <button class="btn-icon" title="QR Code" onclick="showQR(${s.id},'${s.name.replace(/'/g,"\\'")}')">🔲</button>
        <button class="btn-icon" title="Edit" onclick="editStudent(${s.id})">✏️</button>
        <button class="btn-icon" title="Delete" onclick="deleteStudent(${s.id},'${s.name.replace(/'/g,"\\'")}')">🗑</button>
      </td>
    </tr>`).join("");

  students.forEach(async s => {
    try {
      const d = await api(`/api/students/${s.id}`);
      const pct = d.stats.percentage;
      const cell = document.getElementById(`pct-cell-${s.id}`);
      if (cell) cell.innerHTML = `
        <div class="pct-bar-wrap">
          <div class="pct-bar"><div class="pct-fill ${pctClass(pct)}" style="width:${pct}%"></div></div>
          <span class="pct-text" style="color:${pctColor(pct)}">${pct}%</span>
        </div>`;
    } catch (_) {}
  });
}

// Pagination
function updatePaginationUI() {
  const total = allStudentsData.length, totalPages = Math.ceil(total / pageSize);
  const bar = document.getElementById("studentPagination");
  if (total === 0) { bar.style.display = "none"; return; }
  const start = (currentPage - 1) * pageSize + 1;
  const end   = Math.min(currentPage * pageSize, total);
  bar.style.display = "flex";
  document.getElementById("paginationInfo").textContent = `Showing ${start}–${end} of ${total} students`;
  document.getElementById("prevPageBtn").disabled = currentPage === 1;
  document.getElementById("nextPageBtn").disabled = currentPage === totalPages;
  const nums = document.getElementById("pageNumbers");
  nums.innerHTML = "";
  getPageRange(currentPage, totalPages).forEach(p => {
    if (p === "...") {
      const span = document.createElement("span");
      span.textContent = "…"; span.style.cssText = "padding:0 4px;color:var(--text-muted);line-height:32px;";
      nums.appendChild(span);
    } else {
      const btn = document.createElement("button");
      btn.className = `page-number${p === currentPage ? " active" : ""}`;
      btn.textContent = p;
      btn.addEventListener("click", () => { currentPage = p; renderStudentsPage(); });
      nums.appendChild(btn);
    }
  });
}
function getPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
  if (current >= total - 3) return [1, "...", total-4, total-3, total-2, total-1, total];
  return [1, "...", current-1, current, current+1, "...", total];
}
document.getElementById("prevPageBtn").addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderStudentsPage(); } });
document.getElementById("nextPageBtn").addEventListener("click", () => { if (currentPage < Math.ceil(allStudentsData.length / pageSize)) { currentPage++; renderStudentsPage(); } });
document.getElementById("pageSizeSelect").addEventListener("change", e => { pageSize = parseInt(e.target.value); currentPage = 1; renderStudentsPage(); });

// Student search
let searchTimeout;
document.getElementById("studentSearchInput").addEventListener("input", e => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (!q) { loadStudents(); return; }
  searchTimeout = setTimeout(async () => {
    const results = await api(`/api/students/search?q=${encodeURIComponent(q)}`);
    document.getElementById("studentPagination").style.display = "none";
    renderStudentsTable(results);
  }, 300);
});
document.getElementById("studentClassFilter").addEventListener("change", loadStudents);

// Add Student
document.getElementById("addStudentBtn").addEventListener("click", () => {
  document.getElementById("studentModalTitle").textContent = "Add Student";
  document.getElementById("studentId").value = "";
  document.getElementById("studentSubmitBtn").textContent = "Add Student";
  document.getElementById("studentForm").reset();
  openModal("studentModal");
});
document.getElementById("studentForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = document.getElementById("studentId").value;
  const payload = {
    roll_number: document.getElementById("fRoll").value.trim(),
    name:        document.getElementById("fName").value.trim(),
    class_id:    document.getElementById("fClass").value || null,
    email:       document.getElementById("fEmail").value.trim(),
    phone:       document.getElementById("fPhone").value.trim(),
  };
  try {
    if (id) {
      await api(`/api/students/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("Student updated!", "success");
    } else {
      await api("/api/students", { method: "POST", body: JSON.stringify(payload) });
      toast(`"${payload.name}" added!`, "success");
    }
    closeModal("studentModal"); loadStudents();
  } catch (err) { toast(err.message, "error"); }
});

async function editStudent(id) {
  const s = await api(`/api/students/${id}`);
  document.getElementById("studentModalTitle").textContent = "Edit Student";
  document.getElementById("studentSubmitBtn").textContent  = "Save Changes";
  document.getElementById("studentId").value   = s.id;
  document.getElementById("fRoll").value        = s.roll_number;
  document.getElementById("fName").value        = s.name;
  document.getElementById("fClass").value       = s.class_id || "";
  document.getElementById("fEmail").value       = s.email || "";
  document.getElementById("fPhone").value       = s.phone || "";
  openModal("studentModal");
}

async function deleteStudent(id, name) {
  if (!confirm(`Delete "${name}"? All attendance records will be removed.`)) return;
  await api(`/api/students/${id}`, { method: "DELETE" });
  toast(`"${name}" removed`, "info"); loadStudents();
}

// Student Detail with Heatmap + Subject Stats
async function viewStudent(id) {
  const s = await api(`/api/students/${id}`);
  const stats = s.stats; const hist = s.history; const subStats = s.subject_stats || [];
  document.getElementById("detailName").textContent = `${s.name} · ${s.roll_number}`;
  document.getElementById("detailQrBtn").onclick = () => showQR(id, s.name);
  const pct = stats.percentage;
  document.getElementById("studentDetailBody").innerHTML = `
    <div class="detail-stats">
      <div class="detail-stat-box"><div class="detail-stat-val" style="color:${pctColor(pct)}">${pct}%</div><div class="detail-stat-lbl">Attendance</div></div>
      <div class="detail-stat-box"><div class="detail-stat-val" style="color:var(--accent-green)">${stats.present}</div><div class="detail-stat-lbl">Present</div></div>
      <div class="detail-stat-box"><div class="detail-stat-val" style="color:var(--accent-red)">${stats.absent}</div><div class="detail-stat-lbl">Absent</div></div>
      <div class="detail-stat-box"><div class="detail-stat-val" style="color:var(--accent-yellow)">${stats.late}</div><div class="detail-stat-lbl">Late</div></div>
      <div class="detail-stat-box"><div class="detail-stat-val" style="color:var(--accent-purple)">${stats.excused}</div><div class="detail-stat-lbl">Excused</div></div>
      <div class="detail-stat-box"><div class="detail-stat-val">${stats.total}</div><div class="detail-stat-lbl">Total Days</div></div>
    </div>
    <div class="detail-info" style="margin:10px 0;font-size:0.82rem;color:var(--text-secondary);">
      🏫 ${s.class_name || "Unassigned"} &nbsp;|&nbsp; 📧 ${s.email || "—"} &nbsp;|&nbsp; 📱 ${s.phone || "—"}
    </div>
    ${subStats.length ? `
      <div class="detail-history-title" style="margin-bottom:0;">📚 Subject-wise Attendance</div>
      <div class="subject-stats-grid">
        ${subStats.map(sub => `
          <div class="subject-stat-row">
            <span class="subject-stat-name">${sub.subject_name}</span>
            <div class="subject-stat-bar"><div class="subject-stat-fill" style="width:${sub.percentage}%;background:${pctColor(sub.percentage)};"></div></div>
            <span class="subject-stat-pct" style="color:${pctColor(sub.percentage)}">${sub.percentage}%</span>
            <span style="font-size:0.72rem;color:var(--text-muted)">${sub.present}/${sub.total}</span>
          </div>`).join("")}
      </div>` : ""}
    <div class="detail-history-title" style="margin-top:14px;">📅 Attendance Heatmap (last 90 days)</div>
    ${buildHeatmap(hist)}
    <div class="detail-history-title" style="margin-top:14px;">Recent Attendance</div>
    <div class="detail-history">
      ${hist.slice(0,30).map(h => `
        <div class="history-chip ${h.status}" title="${h.notes||""}">
          <span>${h.status}</span>
          <span class="chip-date">${formatDateShort(h.date)}</span>
        </div>`).join("") || '<span style="color:var(--text-muted);font-size:0.82rem;">No records yet.</span>'}
    </div>`;
  openModal("studentDetailModal");
}

// Heatmap builder
function buildHeatmap(history) {
  const statusMap = {};
  history.forEach(h => { statusMap[h.date] = h.status; });
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today);
  start.setDate(start.getDate() - 89);
  // Align to Sunday
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

  const weeks = [];
  let week = [];
  const cur = new Date(start);
  while (cur <= today) {
    const iso = cur.toISOString().split("T")[0];
    const isFuture = cur > today;
    const status = statusMap[iso] || (isFuture ? "future" : "empty");
    week.push({ iso, status, isFuture });
    if (week.length === 7) { weeks.push(week); week = []; }
    cur.setDate(cur.getDate() + 1);
  }
  if (week.length) { while (week.length < 7) week.push({ iso: "", status: "future", isFuture: true }); weeks.push(week); }

  const grid = weeks.map(w =>
    `<div class="heatmap-week">${w.map(d =>
      `<div class="heatmap-day ${d.status}" title="${d.iso ? d.iso + ": " + d.status : ""}"></div>`
    ).join("")}</div>`
  ).join("");

  return `<div class="heatmap-wrap">
    <div class="heatmap-grid">${grid}</div>
    <div class="heatmap-legend">
      <span><div class="dot" style="background:#3fb950"></div>Present</span>
      <span><div class="dot" style="background:#f85149"></div>Absent</span>
      <span><div class="dot" style="background:#d29922"></div>Late</span>
      <span><div class="dot" style="background:#a371f7"></div>Excused</span>
      <span><div class="dot" style="background:var(--bg-hover)"></div>No record</span>
    </div>
  </div>`;
}

window.editStudent   = editStudent;
window.deleteStudent = deleteStudent;
window.viewStudent   = viewStudent;

// ══════════════════════════════════════════════════════════════
// QR CODE
// ══════════════════════════════════════════════════════════════
async function showQR(studentId, name) {
  const url = `/api/students/${studentId}/qr`;
  document.getElementById("qrModalTitle").textContent = `QR Code — ${name}`;
  document.getElementById("qrStudentInfo").textContent = `Scan to identify student`;
  const img = document.getElementById("qrImage");
  img.src = url + "?t=" + Date.now();
  const dl = document.getElementById("qrDownloadBtn");
  dl.href = url; dl.download = `qr_${name.replace(/\s+/g, "_")}.png`;
  closeModal("studentDetailModal");
  openModal("qrModal");
}
window.showQR = showQR;

// ══════════════════════════════════════════════════════════════
// BULK IMPORT
// ══════════════════════════════════════════════════════════════
document.getElementById("bulkImportBtn").addEventListener("click",      () => openModal("importModal"));
document.getElementById("bulkImportSideBtn").addEventListener("click",  () => openModal("importModal"));

document.getElementById("doImportBtn").addEventListener("click", async () => {
  const file = document.getElementById("importFile").files[0];
  if (!file) { toast("Please select a CSV file", "error"); return; }
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/students/import", { method: "POST", body: formData });
  const data = await res.json();
  const resultEl = document.getElementById("importResult");
  resultEl.style.display = "block";
  if (data.success > 0) {
    resultEl.className = "import-result success";
    resultEl.innerHTML = `✅ Successfully imported <strong>${data.success}</strong> of ${data.total} students.${data.failed.length ? `<br>⚠️ ${data.failed.length} rows failed.` : ""}`;
    toast(`Imported ${data.success} students!`, "success");
    loadStudents();
  } else {
    resultEl.className = "import-result error";
    resultEl.innerHTML = `❌ Import failed. Check your CSV format and try again.<br><small>${data.failed[0]?.error || ""}</small>`;
  }
});

// ══════════════════════════════════════════════════════════════
// SUBJECTS VIEW
// ══════════════════════════════════════════════════════════════
async function loadSubjects() {
  const classId = document.getElementById("subjectClassFilter").value;
  const subjects = await api(`/api/subjects${classId ? "?class_id=" + classId : ""}`);
  renderSubjectGrid(subjects);
}

function renderSubjectGrid(subjects) {
  const grid = document.getElementById("subjectGrid");
  if (!subjects.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-state-icon">📚</div><div class="empty-state-text">No subjects yet. Add one!</div></div>`;
    return;
  }
  grid.innerHTML = subjects.map(s => `
    <div class="subject-card">
      <div class="subject-icon">📚</div>
      <div class="subject-info">
        <div class="subject-name">
          <span>${s.name}</span>
          ${s.code ? `<span class="subject-code">${s.code}</span>` : ""}
        </div>
        <div class="subject-class">🏫 ${s.class_name || "—"}</div>
      </div>
      <div class="subject-actions">
        <button class="mark-subject-btn" onclick="openSubjectAtt(${s.id}, '${s.name.replace(/'/g,"\\'")}', ${s.class_id||"null"})">✅ Mark Attendance</button>
        <button class="btn-icon" onclick="deleteSubject(${s.id})" title="Delete">🗑</button>
      </div>
    </div>`).join("");
}

document.getElementById("subjectClassFilter").addEventListener("change", loadSubjects);

document.getElementById("addSubjectBtn").addEventListener("click", () => {
  document.getElementById("subjectForm").reset();
  openModal("subjectModal");
});

document.getElementById("subjectForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name    = document.getElementById("fSubjectName").value.trim();
  const classId = document.getElementById("fSubjectClass").value;
  const code    = document.getElementById("fSubjectCode").value.trim();
  if (!name) return;
  try {
    await api("/api/subjects", { method: "POST", body: JSON.stringify({ name, class_id: classId || null, code }) });
    toast(`Subject "${name}" added!`, "success");
    closeModal("subjectModal");
    loadSubjects();
    populateSubjectSelect();
  } catch (err) { toast(err.message, "error"); }
});

async function deleteSubject(id) {
  if (!confirm("Delete this subject and all its attendance records?")) return;
  await api(`/api/subjects/${id}`, { method: "DELETE" });
  toast("Subject removed", "info"); loadSubjects();
}
window.deleteSubject = deleteSubject;

// Subject Attendance Panel
function openSubjectAtt(subjectId, name, classId) {
  activeSubjectId = subjectId;
  document.getElementById("subjectAttTitle").textContent = `✅ ${name} — Attendance`;
  document.getElementById("subjectAttDate").value = todayISO();
  document.getElementById("subjectAttCard").style.display = "block";
  document.getElementById("subjectAttCard").scrollIntoView({ behavior: "smooth" });
  loadSubjectAtt();
}
window.openSubjectAtt = openSubjectAtt;

document.getElementById("loadSubjectAttBtn").addEventListener("click", loadSubjectAtt);

async function loadSubjectAtt() {
  if (!activeSubjectId) return;
  const date = document.getElementById("subjectAttDate").value;
  if (!date) return;
  subjectAttData = await api(`/api/subjects/${activeSubjectId}/attendance?date=${date}`);
  renderSubjectAttTable(subjectAttData);
  document.getElementById("saveSubjectAttBtn").style.display = "inline-flex";
}

function renderSubjectAttTable(data) {
  const tbody = document.getElementById("subjectAttTbody");
  window._subjectAttMap = {};
  data.forEach(s => { window._subjectAttMap[s.student_id] = s.status === "Not Marked" ? "Absent" : s.status; });
  tbody.innerHTML = data.map((s, i) => {
    const cur = s.status === "Not Marked" ? "" : s.status;
    const map = { Present:"active-P", Absent:"active-A", Late:"active-L", Excused:"active-E" };
    return `<tr>
      <td>${i+1}</td>
      <td><span class="roll-badge">${s.roll_number}</span></td>
      <td><strong>${s.name}</strong></td>
      <td>
        <div class="status-toggle" id="stoggle-${s.student_id}">
          <button class="status-btn ${cur==="Present"?"active-P":""}" onclick="setSAtt(${s.student_id},'Present',this)">✅ P</button>
          <button class="status-btn ${cur==="Absent" ?"active-A":""}" onclick="setSAtt(${s.student_id},'Absent', this)">❌ A</button>
          <button class="status-btn ${cur==="Late"   ?"active-L":""}" onclick="setSAtt(${s.student_id},'Late',   this)">⏰ L</button>
          <button class="status-btn ${cur==="Excused"?"active-E":""}" onclick="setSAtt(${s.student_id},'Excused',this)">🔖 E</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function setSAtt(sid, status, btn) {
  const toggle = document.getElementById(`stoggle-${sid}`);
  toggle.querySelectorAll(".status-btn").forEach(b => b.className = "status-btn");
  const map = { Present:"active-P", Absent:"active-A", Late:"active-L", Excused:"active-E" };
  btn.className = `status-btn ${map[status]}`;
  window._subjectAttMap[sid] = status;
}
window.setSAtt = setSAtt;

document.getElementById("saveSubjectAttBtn").addEventListener("click", async () => {
  const date = document.getElementById("subjectAttDate").value;
  const records = subjectAttData.map(s => ({
    student_id: s.student_id,
    status: window._subjectAttMap[s.student_id] || "Absent"
  }));
  try {
    const res = await api(`/api/subjects/${activeSubjectId}/attendance/mark`, {
      method: "POST", body: JSON.stringify({ date, records })
    });
    toast(`Saved ${res.marked} student records!`, "success");
  } catch (err) { toast(err.message, "error"); }
});

// ══════════════════════════════════════════════════════════════
// LEAVE MANAGEMENT
// ══════════════════════════════════════════════════════════════
async function loadLeaves() {
  const leaves = await api("/api/leaves");
  const filter = document.getElementById("leaveStatusFilter").value;
  const filtered = filter ? leaves.filter(l => l.status === filter) : leaves;
  renderLeaveTable(filtered);
}
document.getElementById("leaveStatusFilter").addEventListener("change", loadLeaves);

function renderLeaveTable(leaves) {
  const tbody = document.getElementById("leavesTbody");
  if (!leaves.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No leave records found.</td></tr>`; return;
  }
  tbody.innerHTML = leaves.map(l => `
    <tr>
      <td><strong>${l.student_name}</strong><div style="font-size:0.72rem;color:var(--text-muted)">${l.roll_number}</div></td>
      <td>${l.class_name || "—"}</td>
      <td>${formatDateShort(l.from_date)}</td>
      <td>${formatDateShort(l.to_date)}</td>
      <td style="color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${l.reason}">${l.reason || "—"}</td>
      <td><span class="leave-status ${l.status}">${l.status}</span></td>
      <td>
        ${l.status === "Pending" ? `<button class="btn-icon" title="Approve" onclick="updateLeave(${l.id},'Approved')">✅</button><button class="btn-icon" title="Reject" onclick="updateLeave(${l.id},'Rejected')">❌</button>` : ""}
        <button class="btn-icon" title="Delete" onclick="deleteLeave(${l.id})">🗑</button>
      </td>
    </tr>`).join("");
}

document.getElementById("addLeaveBtn").addEventListener("click", async () => {
  const students = await api("/api/students");
  const sel = document.getElementById("fLeaveStudent");
  sel.innerHTML = '<option value="">— Select Student —</option>';
  students.forEach(s => {
    const o = document.createElement("option");
    o.value = s.id; o.textContent = `${s.name} (${s.roll_number})`;
    sel.appendChild(o);
  });
  document.getElementById("leaveForm").reset();
  openModal("leaveModal");
});

document.getElementById("leaveForm").addEventListener("submit", async e => {
  e.preventDefault();
  const payload = {
    student_id: document.getElementById("fLeaveStudent").value,
    from_date:  document.getElementById("fLeaveFrom").value,
    to_date:    document.getElementById("fLeaveTo").value,
    reason:     document.getElementById("fLeaveReason").value,
    status:     document.getElementById("fLeaveStatus").value,
  };
  if (!payload.student_id || !payload.from_date || !payload.to_date) { toast("Fill required fields", "error"); return; }
  try {
    await api("/api/leaves", { method: "POST", body: JSON.stringify(payload) });
    toast("Leave added!", "success");
    closeModal("leaveModal"); loadLeaves();
  } catch (err) { toast(err.message, "error"); }
});

async function updateLeave(id, status) {
  await api(`/api/leaves/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
  toast(`Leave ${status.toLowerCase()}`, "success"); loadLeaves();
}
async function deleteLeave(id) {
  if (!confirm("Delete this leave record?")) return;
  await api(`/api/leaves/${id}`, { method: "DELETE" });
  toast("Leave removed", "info"); loadLeaves();
}
window.updateLeave = updateLeave; window.deleteLeave = deleteLeave;

document.getElementById("applyLeavesBtn").addEventListener("click", async () => {
  if (!confirm("Apply all approved leaves as 'Excused' attendance? This may overwrite existing records.")) return;
  try {
    const res = await api("/api/leaves/apply", { method: "POST" });
    toast(`Applied leaves: ${res.updated} attendance records updated!`, "success");
  } catch (err) { toast(err.message, "error"); }
});

// ══════════════════════════════════════════════════════════════
// HOLIDAYS
// ══════════════════════════════════════════════════════════════
async function loadHolidays() {
  const holidays = await api("/api/holidays");
  document.getElementById("holidayCount").textContent = `${holidays.length} total`;
  const tbody = document.getElementById("holidaysTbody");
  if (!holidays.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No holidays added yet.</td></tr>`; return;
  }
  tbody.innerHTML = holidays.map(h => `
    <tr>
      <td><strong>${formatDate(h.date)}</strong></td>
      <td style="color:var(--text-secondary)">${dayName(h.date)}</td>
      <td>${h.name}</td>
      <td><span class="htype-badge htype-${h.type}">${h.type}</span></td>
      <td><button class="btn-icon" title="Delete" onclick="deleteHoliday(${h.id})">🗑</button></td>
    </tr>`).join("");
}

document.getElementById("addHolidayBtn").addEventListener("click", async () => {
  const date = document.getElementById("holidayDate").value;
  const name = document.getElementById("holidayName").value.trim();
  const type = document.getElementById("holidayType").value;
  if (!date || !name) { toast("Enter a date and name", "error"); return; }
  try {
    await api("/api/holidays", { method: "POST", body: JSON.stringify({ date, name, type }) });
    toast(`Holiday "${name}" added!`, "success");
    document.getElementById("holidayDate").value = "";
    document.getElementById("holidayName").value = "";
    loadHolidays();
  } catch (err) { toast(err.message, "error"); }
});

async function deleteHoliday(id) {
  if (!confirm("Remove this holiday?")) return;
  await api(`/api/holidays/${id}`, { method: "DELETE" });
  toast("Holiday removed", "info"); loadHolidays();
}
window.deleteHoliday = deleteHoliday;

// ══════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════
function initReportsView() {
  if (!document.getElementById("reportStart").value) {
    document.getElementById("reportStart").value = firstMonthDay();
    document.getElementById("reportEnd").value   = todayISO();
  }
}
document.getElementById("genReportBtn").addEventListener("click",   loadReport);
document.getElementById("exportCsvBtn").addEventListener("click",   exportCsv);
document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);

async function loadReport() {
  const start   = document.getElementById("reportStart").value;
  const end     = document.getElementById("reportEnd").value;
  const classId = document.getElementById("reportClass").value;
  if (!start || !end) { toast("Select a date range", "error"); return; }
  const card  = document.getElementById("reportTableCard");
  const tbody = document.getElementById("reportTbody");
  card.style.display = "block";
  tbody.innerHTML = `<tr><td colspan="9"><div class="loading"><div class="spinner"></div> Generating…</div></td></tr>`;
  const rows = await api(`/api/reports?start=${start}&end=${end}${classId ? "&class_id=" + classId : ""}`);
  document.getElementById("reportSub").textContent = `${formatDateShort(start)} – ${formatDateShort(end)} · ${rows.length} students`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data for this period.</div></div></td></tr>`; return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="roll-badge">${r.roll_number}</span></td>
      <td><strong>${r.name}</strong></td>
      <td>${r.class_name||"—"}</td>
      <td style="text-align:center">${r.total_days}</td>
      <td style="text-align:center;color:var(--accent-green);font-weight:600">${r.present}</td>
      <td style="text-align:center;color:var(--accent-red);font-weight:600">${r.absent}</td>
      <td style="text-align:center;color:var(--accent-yellow);font-weight:600">${r.late}</td>
      <td style="text-align:center;color:var(--accent-purple);font-weight:600">${r.excused}</td>
      <td class="report-pct-cell ${pctClass(r.percentage)}">${r.percentage}%</td>
    </tr>`).join("");
}

function exportCsv() {
  const start = document.getElementById("reportStart").value;
  const end   = document.getElementById("reportEnd").value;
  const cls   = document.getElementById("reportClass").value;
  if (!start || !end) { toast("Select a date range", "error"); return; }
  window.location.href = `/api/reports/export?start=${start}&end=${end}${cls ? "&class_id=" + cls : ""}`;
  toast("Downloading CSV…", "info");
}

function exportExcel() {
  const start = document.getElementById("reportStart").value;
  const end   = document.getElementById("reportEnd").value;
  const cls   = document.getElementById("reportClass").value;
  if (!start || !end) { toast("Select a date range", "error"); return; }
  window.location.href = `/api/reports/export-excel?start=${start}&end=${end}${cls ? "&class_id=" + cls : ""}`;
  toast("Downloading Excel file…", "info");
}

// ══════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════
async function loadAuditLog() {
  const logs = await api("/api/audit?limit=100");
  const tbody = document.getElementById("auditTbody");
  if (!logs.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No audit events yet.</td></tr>`; return;
  }
  tbody.innerHTML = logs.map(l => {
    const ts = new Date(l.timestamp).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" });
    return `<tr>
      <td class="audit-ts">${ts}</td>
      <td><span class="audit-action audit-${l.action}">${l.action}</span></td>
      <td style="color:var(--text-secondary);font-size:0.82rem">${l.entity}</td>
      <td style="font-size:0.82rem;color:var(--text-secondary)">${l.description}</td>
    </tr>`;
  }).join("");
}

document.getElementById("clearAuditBtn").addEventListener("click", async () => {
  if (!confirm("Clear all audit log entries?")) return;
  await api("/api/audit/clear", { method: "POST" });
  toast("Audit log cleared", "info"); loadAuditLog();
});

// ══════════════════════════════════════════════════════════════
// GLOBAL SEARCH
// ══════════════════════════════════════════════════════════════
let searchDebounce;
document.getElementById("globalSearch").addEventListener("input", async e => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  const results = document.getElementById("searchResults");
  if (!q) { results.classList.remove("visible"); return; }
  searchDebounce = setTimeout(async () => {
    const students = await api(`/api/students/search?q=${encodeURIComponent(q)}`);
    results.innerHTML = students.length
      ? students.map(s => `<div class="search-result-item" onclick="goToStudent(${s.id})"><div class="sr-name">${s.name}</div><div class="sr-meta">${s.roll_number} · ${s.class_name || "Unassigned"}</div></div>`).join("")
      : `<div class="search-result-item"><div class="sr-name" style="color:var(--text-muted)">No results</div></div>`;
    results.classList.add("visible");
  }, 250);
});
document.addEventListener("click", e => {
  if (!document.getElementById("globalSearchBox").contains(e.target))
    document.getElementById("searchResults").classList.remove("visible");
});
async function goToStudent(id) {
  document.getElementById("globalSearch").value = "";
  document.getElementById("searchResults").classList.remove("visible");
  switchView("students");
  await new Promise(r => setTimeout(r, 100));
  viewStudent(id);
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
(async function init() {
  await loadClasses();
  loadDashboard();
  const urlParams = new URLSearchParams(window.location.search);
  const sid = urlParams.get("student_id");
  if (sid) {
    switchView("students");
    await new Promise(r => setTimeout(r, 150));
    viewStudent(sid);
  }
})();
