/* ═══════════════════════════════════════
   SYNCLIST — Frontend App
   Changes from original:
     1. dueTime field added throughout (quickAdd, render, openEdit, saveEdit)
     2. Dual checkboxes — each user checks off independently via doneBy:{You,Friend}
     3. toggleUser(id, user, val) replaces toggle(id, completed)
     4. Progress bar counts a todo as "done" only when BOTH users checked it
   ═══════════════════════════════════════ */

let currentUser = localStorage.getItem("synclist_user") || null;
let todos = [], files = [];
let currentFilter = "all";
let editingId = null;

// ── Socket.io ──────────────────────────────
const socket = io();
socket.on("todo:new",    t  => { todos.unshift(t); render(); toast(`📌 New to-do added`); });
socket.on("todo:update", t  => { const i = todos.findIndex(x=>x.id===t.id); if(i>-1){todos[i]=t; render();} });
socket.on("todo:delete", id => { todos=todos.filter(t=>t.id!==id); render(); toast("🗑 To-do removed"); });
socket.on("file:new",    f  => { files.unshift(f); renderFiles(); toast("📎 New file shared!"); });
socket.on("file:delete", id => { files=files.filter(f=>f.id!==id); renderFiles(); toast("🗑 File removed"); });

// ── Boot ───────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  if (currentUser) showApp();
  fetch("/api/todos").then(r=>r.json()).then(d=>{ todos=d; render(); });
  fetch("/api/files").then(r=>r.json()).then(d=>{ files=d; renderFiles(); });
});

// ── User ───────────────────────────────────
function selectUser(u) {
  currentUser = u;
  localStorage.setItem("synclist_user", u);
  showApp();
  toast(`Welcome, ${u}! 👋`);
}

function showApp() {
  document.getElementById("user-overlay").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  const chip = document.getElementById("user-chip");
  chip.textContent = currentUser === "You" ? "● You" : "● Friend";
  chip.style.color = currentUser === "You" ? "var(--accent)" : "var(--green)";
  document.getElementById("qa-who").value = currentUser || "You";
}

function showOverlay() {
  document.getElementById("user-overlay").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

// ── Tabs ───────────────────────────────────
function switchTab(tab) {
  ["todos","files"].forEach(t => {
    document.getElementById(`view-${t}`).classList.toggle("hidden", t !== tab);
    document.getElementById(`tab-btn-${t}`).classList.toggle("active", t === tab);
  });
}

// ── Filter ─────────────────────────────────
function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  render();
}

// ── CHANGE 1: bothDone helper ───────────────
// A todo is fully "done" when BOTH users have checked it.
function bothDone(t) {
  const db = t.doneBy || {};
  return !!(db.You && db.Friend);
}

// ── Render To-Dos ──────────────────────────
function render() {
  const filtered = todos.filter(t => {
    if (currentFilter === "pending") return !bothDone(t);
    if (currentFilter === "done")    return bothDone(t);
    if (currentFilter === "You")     return t.assignee === "You";
    if (currentFilter === "Friend")  return t.assignee === "Friend";
    return true;
  });

  // Progress — counts only todos where BOTH have checked off
  const total = todos.length, done = todos.filter(t=>bothDone(t)).length;
  const pct = total ? Math.round((done/total)*100) : 0;
  document.getElementById("prog-fill").style.width = pct + "%";
  document.getElementById("prog-txt").textContent = total ? `${done}/${total} done` : "";
  document.getElementById("count-lbl").textContent = filtered.length ? `${filtered.length} item${filtered.length!==1?"s":""}` : "";

  const ul = document.getElementById("todo-ul");
  const empty = document.getElementById("todo-empty");

  if (filtered.length === 0) {
    ul.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  ul.innerHTML = filtered.map(t => {
    // CHANGE 2: doneBy object — fallback for old todos that only have completed:bool
    const doneBy = t.doneBy || { You: !!t.completed, Friend: !!t.completed };
    const fullyDone = doneBy.You && doneBy.Friend;

    // CHANGE 3: due date + time display
    const dueHtml = (() => {
      if (!t.dueDate) return "";
      const d = new Date(t.dueDate + "T00:00:00");
      const today = new Date(); today.setHours(0,0,0,0);
      const diff = Math.round((d - today) / 86400000);
      let cls = "", label = "";
      if      (diff < 0)  { cls = "overdue"; label = `⚠ ${Math.abs(diff)}d overdue`; }
      else if (diff === 0){ cls = "today";   label = "Due today"; }
      else if (diff === 1){ label = "Due tomorrow"; }
      else                { label = `Due ${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}`; }

      // Append time if present
      const timeStr = t.dueTime ? ` · ${fmtTime(t.dueTime)}` : "";
      return `<span class="todo-due ${cls}">📅 ${label}${timeStr}</span>`;
    })();

    // CHANGE 4: dual checkbox HTML — one button per user
    const cbYou    = `<button class="dual-cb ${doneBy.You    ? "checked you-checked"    : ""}"
                        onclick="toggleUser('${t.id}','You',${!doneBy.You})"
                        title="Mark done for You">
                        <span class="cb-avatar cb-you">Y</span>
                        ${doneBy.You ? "✓" : ""}
                      </button>`;
    const cbFriend = `<button class="dual-cb ${doneBy.Friend ? "checked friend-checked" : ""}"
                        onclick="toggleUser('${t.id}','Friend',${!doneBy.Friend})"
                        title="Mark done for Friend">
                        <span class="cb-avatar cb-friend">F</span>
                        ${doneBy.Friend ? "✓" : ""}
                      </button>`;

    return `<li class="todo-li pri-${t.priority} ${fullyDone ? "is-done" : ""}">
      <div class="dual-cb-col">
        ${cbYou}
        ${cbFriend}
      </div>
      <div class="todo-body">
        <div class="todo-title">${esc(t.title)}</div>
        ${t.description ? `<div class="todo-note">${esc(t.description)}</div>` : ""}
        <div class="todo-tags">
          <span class="tag ${t.assignee==="You"?"tag-you":"tag-friend"}">${t.assignee}</span>
          <span class="tag tag-${t.priority}">${priLabel(t.priority)}</span>
          ${dueHtml}
        </div>
      </div>
      <div class="todo-acts">
        <button class="ico-btn" onclick="openEdit('${t.id}')" title="Edit">✏️</button>
        <button class="ico-btn del" onclick="del('${t.id}')" title="Delete">🗑</button>
      </div>
    </li>`;
  }).join("");
}

// ── Quick-add ──────────────────────────────
async function quickAdd() {
  const titleEl = document.getElementById("qa-text");
  const title = titleEl.value.trim();
  if (!title) {
    titleEl.focus();
    titleEl.style.outline = "2px solid red";
    setTimeout(() => titleEl.style.outline = "", 1000);
    return;
  }

  await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      assignee: document.getElementById("qa-who").value,
      priority: document.getElementById("qa-pri").value,
      dueDate:  document.getElementById("qa-due").value  || null,
      dueTime:  document.getElementById("qa-time").value || null,   // CHANGE 5: send time
      doneBy:   { You: false, Friend: false },                      // CHANGE 6: init dual state
    })
  });

  titleEl.value = "";
  document.getElementById("qa-due").value  = "";
  document.getElementById("qa-time").value = "";  // CHANGE 7: clear time input
  titleEl.focus();
}

// ── CHANGE 8: toggleUser — patches one user's done state ──
async function toggleUser(id, user, val) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  // Build updated doneBy, preserving the other user's state
  const current = todo.doneBy || { You: !!todo.completed, Friend: !!todo.completed };
  const doneBy  = { ...current, [user]: val };
  const completed = doneBy.You && doneBy.Friend; // legacy field for server compat

  await fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doneBy, completed }),
  });
}

async function del(id) {
  if (!confirm("Delete this to-do?")) return;
  await fetch(`/api/todos/${id}`, { method: "DELETE" });
}

// ── Edit Modal ─────────────────────────────
function openEdit(id) {
  const t = todos.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById("e-title").value = t.title;
  document.getElementById("e-note").value  = t.description || "";
  document.getElementById("e-who").value   = t.assignee;
  document.getElementById("e-pri").value   = t.priority;
  document.getElementById("e-due").value   = t.dueDate || "";
  document.getElementById("e-time").value  = t.dueTime || "";   // CHANGE 9: load time
  document.getElementById("modal").classList.remove("hidden");
  document.getElementById("e-title").focus();
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  editingId = null;
}

async function saveEdit() {
  const title = document.getElementById("e-title").value.trim();
  if (!title) return;
  await fetch(`/api/todos/${editingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      description: document.getElementById("e-note").value.trim(),
      assignee:    document.getElementById("e-who").value,
      priority:    document.getElementById("e-pri").value,
      dueDate:     document.getElementById("e-due").value  || null,
      dueTime:     document.getElementById("e-time").value || null,  // CHANGE 10: save time
    })
  });
  closeModal();
}

document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// ── Files ──────────────────────────────────
function renderFiles() {
  const grid  = document.getElementById("file-grid");
  const empty = document.getElementById("file-empty");
  if (files.length === 0) { grid.innerHTML = ""; empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  grid.innerHTML = files.map(f => `
    <div class="file-card">
      <span class="file-ico">${emoji(f.mimetype, f.originalName)}</span>
      <div class="file-name" title="${esc(f.originalName)}">${esc(f.originalName)}</div>
      <div class="file-info">
        ${fmtBytes(f.size)} · Uploaded by
        <strong style="color:${f.uploadedBy==="You"?"var(--accent)":"var(--green)"}">${f.uploadedBy}</strong><br/>
        ${fmtDate(f.uploadedAt)}
      </div>
      <div class="file-btns">
        <a class="btn-sm" href="${f.url}" download="${esc(f.originalName)}">⬇ Download</a>
        <button class="btn-sm del" onclick="delFile('${f.id}')">✕ Remove</button>
      </div>
    </div>`).join("");
}

async function uploadFile(input) {
  const file = input.files[0]; if (!file) return;
  const prog = document.getElementById("upload-prog"),
        fill = document.getElementById("upload-fill"),
        lbl  = document.getElementById("upload-lbl");
  prog.classList.remove("hidden"); lbl.textContent = `Uploading ${file.name}…`;
  let p = 0;
  const iv = setInterval(() => { p = Math.min(p + Math.random()*12, 85); fill.style.width = p+"%"; }, 150);
  const fd = new FormData();
  fd.append("file", file);
  fd.append("uploadedBy", currentUser || "You");
  try {
    const r = await fetch("/api/files", { method:"POST", body:fd });
    clearInterval(iv);
    fill.style.width = "100%"; lbl.textContent = "Uploaded!";
    setTimeout(() => prog.classList.add("hidden"), 1200);
    if (!r.ok) lbl.textContent = "Failed.";
  } catch {
    clearInterval(iv); lbl.textContent = "Failed.";
    setTimeout(() => prog.classList.add("hidden"), 2000);
  }
  input.value = "";
}

async function delFile(id) {
  if (!confirm("Remove this file for both of you?")) return;
  await fetch(`/api/files/${id}`, { method:"DELETE" });
}

// ── Utils ──────────────────────────────────
const esc      = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const priLabel = p => ({ high:"High", medium:"Medium", low:"Low" }[p] || p);
const fmtBytes = b => b<1024 ? b+"B" : b<1048576 ? (b/1024).toFixed(1)+"KB" : (b/1048576).toFixed(1)+"MB";
const fmtDate  = s => new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

// CHANGE 11: fmtTime — converts "HH:MM" to "12:30 PM" style
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

const emoji = (m, n) => {
  if (!m) m = "";
  if (m.startsWith("image/"))  return "🖼️";
  if (m.includes("pdf"))       return "📄";
  if (m.includes("spreadsheet") || n?.endsWith(".xlsx") || n?.endsWith(".csv")) return "📊";
  if (m.includes("word") || n?.endsWith(".docx")) return "📝";
  if (m.startsWith("video/"))  return "🎬";
  if (m.startsWith("audio/"))  return "🎵";
  if (m.includes("zip") || m.includes("tar")) return "📦";
  return "📎";
};

let toastT;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add("hidden"), 2800);
}