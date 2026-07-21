import { idr, toast, fileToBase64 } from "../utils.js";
import { unwrap } from "../db.js";

const pad = (n) => String(n).padStart(2, "0");
const esc = (s) =>
  (s || "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
const fmtH = (h) => `${pad(h)}:00`;
function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}
function monthShort(y, m) {
  return new Date(y, m - 1, 1).toLocaleString("id-ID", { month: "short" });
}
function fmtCountdown(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return (h > 0 ? h + ":" : "") + pad(m) + ":" + pad(sec);
}
// Parse a stored timestamp string to JS ms timestamp
function dtMs(str) {
  if (!str) return 0;
  return new Date(str.replace(" ", "T")).getTime();
}
// Get HH:MM from a timestamp string (local interpretation)
function getTimeStr(str) {
  if (!str) return "00:00";
  const d = new Date(str.replace(" ", "T"));
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}
// Get YYYY-MM-DD from a timestamp string (local interpretation)
function getDateStr(str) {
  if (!str) return "";
  const d = new Date(str.replace(" ", "T"));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Module state ──────────────────────────────────────────────────────────────
let _db = null;
let _isManager = true;
let _roState = { y: 0, m: 0, d: 0 };
let _rentPending = {};
let _editingRentId = null; // null = new booking, integer = editing single existing
let _editingGroupIds = null; // array of IDs when editing a whole group
let _editingMeta = {}; // { memberId, memberName, guestName } from the existing row
let _availTimer = null;
let _racketData = [];
let _racketSort = { field: "name", asc: true };
let _racketSearch = "";
let _roSearch = "";
let _cellPrefill = null; // { date, startH, racketId } — set when a grid cell is clicked
let _gridRowMap = new Map(); // rent_log row id -> row (for the currently loaded day)
let _gridGroupMap = new Map(); // rent_log row id -> group it belongs to (for the currently loaded day)

// Timeline grid covers 17 one-hour slots: 06:00 start through 22:00 start (ends 23:00)
const GRID_START_HOUR = 6;
const GRID_SLOT_COUNT = 17;

// ── Entry Point ───────────────────────────────────────────────────────────────
export async function renderRacket(container, db, role = "manager") {
  _db = db;
  _isManager = role === "manager";
  _editingRentId = null;
  _editingMeta = {};
  container.innerHTML = buildHTML();

  const today = new Date();
  _roState = {
    y: today.getFullYear(),
    m: today.getMonth() + 1,
    d: today.getDate(),
  };
  document.getElementById("ro-month").value = _roState.m;
  document.getElementById("ro-year").value = _roState.y;
  setTpDateToday();

  initSlider(db);
  initEventListeners(db);
  await loadStats(db);
  await loadRacketTable(db);
  initRentOverview(db);

  const ticker = setInterval(() => {
    if (!document.getElementById("racket-stats-available")) {
      clearInterval(ticker);
      return;
    }
    updateCountdowns();
  }, 1000);
}

function setTpDateToday() {
  const today = new Date();
  const tpDate = document.getElementById("tp-date");
  if (!tpDate) return;
  tpDate.value = today.toISOString().slice(0, 10);
  tpDate.min = today.toISOString().slice(0, 10);
  tpDate.max = new Date(today.getTime() + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
}

// ── Racket SVG Icon ───────────────────────────────────────────────────────────
const RACKET_SVG = `<svg class="w-5 h-6" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="9.5" cy="7.5" r="9" fill="currentColor"/>
  <path d="M13 14 L19 22" stroke-width="3.5" fill="none"/>
</svg>`;

// ── HTML Template ─────────────────────────────────────────────────────────────
function buildHTML() {
  const months = Array.from(
    { length: 12 },
    (_, i) =>
      `<option value="${i + 1}">${new Date(2000, i, 1).toLocaleString("id-ID", { month: "long" })}</option>`,
  ).join("");
  const years = Array.from({ length: 7 }, (_, i) => {
    const y = new Date().getFullYear() - 3 + i;
    return `<option value="${y}">${y}</option>`;
  }).join("");

  const hourLabels = Array.from(
    { length: GRID_SLOT_COUNT },
    (_, i) => `<div class="rt-hour-label">${fmtH(GRID_START_HOUR + i)}</div>`,
  ).join("");

  return `
<div class="space-y">
  <!-- Stats -->
  
  <!-- Two-column -->
<div></div>    <!-- Right: Rent Timeline -->
    <div class="card p-0 overflow-hidden flex flex-col" style="min-height:0;">
   <div class="px-5 py-4 border-b border-gray-100 flex-shrink-0">
  <div class="flex items-start justify-between gap-4 mb-3">

    <div>
       <div class="flex items-center gap-3 text-[11px] text-gray-400 mt-2 flex-wrap">
        <span class="flex items-center gap-1"><span class="rt-legend-dot rt-block-booked"></span>Booked</span>
        <span class="flex items-center gap-1"><span class="rt-legend-dot rt-block-live"></span>Renting</span>
        <span class="flex items-center gap-1"><span class="rt-legend-dot rt-block-ended"></span>Ended</span>
        <span class="flex items-center gap-1"><span class="rt-legend-dot rt-block-returned"></span>Returned</span>
        <span class="flex items-center gap-1"><span class="rt-legend-dot rt-block-cancelled"></span>Cancelled</span>
      </div>
    </div>

    <div class="flex gap-2">
      ${_isManager ? `
      <button id="btn-add-racket"
        class="btn-secondary text-xs py-2 px-4">
        + Add
      </button>` : ''}

      <button id="btn-rent-new"
        class="btn-primary text-xs py-2 px-4">
        + Rent
      </button>
    </div>

  </div>

  <div class="flex items-center gap-2">
    <select id="ro-month" class="form-input py-1.5 text-xs" style="width:auto;">
      ${months}
    </select>

    <select id="ro-year" class="form-input py-1.5 text-xs" style="width:auto;">
      ${years}
    </select>
  </div>
</div>
      <div id="ro-day-bar" class="flex gap-1.5 overflow-x-auto px-5 py-3 border-b border-gray-100 flex-shrink-0" style="scrollbar-width:thin;"></div>
      <div class="px-5 pt-3 pb-2 flex items-center gap-3 flex-shrink-0">
        <p id="ro-showing" class="text-xs text-gray-400 flex-1"></p>
        <input id="ro-search" type="text" class="form-input text-xs py-1" style="width:180px;" placeholder="Search member / racket..."/>
      </div>
      <div class="rt-wrap overflow-auto flex-1 px-3 pb-3">
        <div class="rt-header">
           <div class="rt-hours">${hourLabels}</div>
        </div>
        <div id="ro-grid-body" class="rt-body">
          <p class="text-center text-gray-400 py-8 text-sm">Select a date above</p>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ───── MODAL: Member Picker ───── -->
<div id="modal-member-pick" class="modal-overlay hidden">
  <div class="modal-box max-w-lg">
    <div class="modal-header">
      <h3 class="font-semibold">Pick Member</h3>
      <button id="close-member-modal" class="text-white/80 hover:text-white text-xl leading-none">&times;</button>
    </div>
    <div class="p-4 space-y-3">
      <div class="flex gap-2">
        <input type="text" id="mp-guest-name" class="form-input flex-1" placeholder="Guest name (walk-in)"/>
        <button id="mp-use-guest" class="btn-primary whitespace-nowrap">Use Guest</button>
      </div>
      <div class="relative">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <input type="text" id="mp-search" class="form-input pl-9" placeholder="Search members..."/>
      </div>
      <div class="overflow-y-auto border border-gray-100 rounded-xl" style="max-height:260px;">
        <table class="w-full">
          <thead><tr>
            <th class="table-th text-xs">ID</th><th class="table-th text-xs">Name</th>
            <th class="table-th text-xs">Status</th><th class="table-th"></th>
          </tr></thead>
          <tbody id="mp-member-list"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- ───── MODAL: Time Picker ───── -->
<div id="modal-time-pick" class="modal-overlay hidden">
  <div class="modal-box max-w-lg">
    <div class="modal-header">
      <h3 id="tp-modal-title" class="font-semibold">Pick Date &amp; Time Range</h3>
      <button id="close-time-modal" class="text-white/80 hover:text-white text-xl leading-none">&times;</button>
    </div>
    <div class="p-4 space-y-4">
      <input type="hidden" id="tp-member-id"/>
      <input type="hidden" id="tp-guest-name"/>
      <div id="tp-context-bar" class="hidden bg-orange-50 rounded-xl px-3 py-2 text-sm">
        <span class="text-gray-500">Editing booking for:</span>
        <span id="tp-context-member" class="font-semibold text-gray-800 ml-1"></span>
      </div>
      <div>
        <label class="form-label">Date</label>
        <input type="date" id="tp-date" class="form-input"/>
      </div>
      <div>
        <label class="form-label">Hours (drag sliders)</label>
        <p class="text-xs text-gray-400 mb-3">Operating: 06:00 – 23:00</p>
        <div class="flex justify-between mb-3">
          <div class="text-center" style="min-width:60px;">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wider">Start</div>
            <div id="tp-start-lbl" class="text-2xl font-bold text-gray-800">06:00</div>
          </div>
          <div class="text-center" style="min-width:60px;">
            <div class="text-xs text-gray-500 font-semibold uppercase tracking-wider">End</div>
            <div id="tp-end-lbl" class="text-2xl font-bold text-gray-800">07:00</div>
          </div>
        </div>
        <div style="padding:0 4px;">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
          <div style="position:relative;height:40px;">
            <div id="tp-fill" style="position:absolute;height:6px;top:50%;transform:translateY(-50%);background:#f97316;opacity:0.4;border-radius:999px;z-index:1;pointer-events:none;"></div>
            <span id="tp-dur-bubble" style="position:absolute;top:calc(50% + 14px);transform:translateX(-50%);background:#fff;border:1px solid #e5e7eb;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap;z-index:4;box-shadow:0 2px 6px rgba(0,0,0,0.07);">1h</span>
            <input type="range" id="tp-start" min="6" max="23" step="1" value="6"
              style="position:absolute;width:100%;top:50%;transform:translateY(-50%);pointer-events:none;background:transparent;-webkit-appearance:none;height:40px;margin:0;"/>
            <input type="range" id="tp-end" min="6" max="23" step="1" value="7"
              style="position:absolute;width:100%;top:50%;transform:translateY(-50%);pointer-events:none;background:transparent;-webkit-appearance:none;height:40px;margin:0;"/>
          </div>
        </div>
      </div>
      <div class="flex gap-2 pt-2">
        <button id="tp-back-btn" class="btn-secondary flex-1">← Back</button>
        <button id="tp-check-btn" class="btn-primary flex-1">Show Available Rackets</button>
      </div>
      <!-- Availability -->
      <div id="tp-avail-box" class="hidden space-y-3 pt-1">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-gray-800">Available Rackets</p>
          <label class="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" id="tp-check-all" class="accent-orange-500"/>
            <span id="tp-checkall-label">Select all</span>
          </label>
        </div>
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <input type="text" id="tp-avail-search" class="form-input pl-9 text-xs" placeholder="Search racket..."/>
        </div>
        <div class="border border-gray-100 rounded-xl overflow-hidden" style="max-height:200px;overflow-y:auto;">
          <table class="w-full">
            <thead><tr>
              <th class="table-th" style="width:36px;"></th>
              <th class="table-th text-xs">Name</th>
              <th class="table-th text-xs">Model</th>
              <th class="table-th text-xs text-right">Price</th>
            </tr></thead>
            <tbody id="tp-avail-body"></tbody>
          </table>
        </div>
        <div class="flex items-center gap-3 text-xs flex-wrap">
          <span class="badge-gray">Selected: <span id="tp-sel-count">0</span></span>
          <span class="badge-gray">Subtotal: <span id="tp-sel-subtotal">Rp 0</span></span>
          <button id="tp-rent-now-btn" class="btn-primary ml-auto" disabled>Rent Now</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ───── MODAL: Confirm Rent ───── -->
<div id="modal-confirm-rent" class="modal-overlay hidden">
  <div class="modal-box max-w-sm">
    <div class="modal-header">
      <h3 id="cr-modal-title" class="font-semibold">Confirm Rent</h3>
      <button id="close-confirm-modal" class="text-white/80 hover:text-white text-xl leading-none">&times;</button>
    </div>
    <div class="p-5 space-y-2 text-sm">
      <div class="flex gap-2"><span class="text-gray-500 w-20 shrink-0">Member:</span><span id="cr-member" class="font-medium text-gray-800"></span></div>
      <div class="flex gap-2"><span class="text-gray-500 w-20 shrink-0">Date:</span><span id="cr-date" class="font-medium text-gray-800"></span></div>
      <div class="flex gap-2"><span class="text-gray-500 w-20 shrink-0">Time:</span><span id="cr-time" class="font-medium text-gray-800"></span></div>
      <div class="flex gap-2"><span class="text-gray-500 w-20 shrink-0">Rackets:</span><span id="cr-count" class="font-medium text-gray-800"></span></div>
      <div class="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-100 flex items-center justify-between">
        <span class="text-gray-600">Total</span>
        <span id="cr-total" class="font-bold text-orange-600 text-base"></span>
      </div>
    </div>
    <div class="flex gap-3 px-5 pb-5">
      <button id="close-confirm-modal-2" class="btn-secondary flex-1">Cancel</button>
      <button id="cr-submit-btn" class="btn-primary flex-1">Confirm &amp; Rent</button>
    </div>
  </div>
</div>

<!-- ───── MODAL: Booking Detail (from timeline click) ───── -->
<div id="modal-block-detail" class="modal-overlay hidden">
  <div class="modal-box max-w-sm">
    <div class="modal-header">
      <h3 id="bd-title" class="font-semibold">Booking Detail</h3>
      <button id="close-block-detail" class="text-white/80 hover:text-white text-xl leading-none">&times;</button>
    </div>
    <div class="p-5 space-y-2 text-sm">
      <div class="flex gap-2"><span class="text-gray-500 w-20 shrink-0">Member:</span><span id="bd-member" class="font-medium text-gray-800"></span></div>
      <div class="flex gap-2"><span class="text-gray-500 w-20 shrink-0">Time:</span><span id="bd-time" class="font-medium text-gray-800"></span></div>
      <div class="flex gap-2"><span class="text-gray-500 w-20 shrink-0">Price:</span><span id="bd-price" class="font-medium text-gray-800"></span></div>
    </div>
    <div class="flex gap-2 px-5 pb-5 flex-wrap">
      <button id="bd-btn-return" class="hidden flex-1 text-sm py-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-medium">Mark Returned</button>
      <button id="bd-btn-cancel" class="hidden flex-1 text-sm py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-medium">Cancel Booking</button>
      <button id="bd-btn-edit" class="hidden flex-1 text-sm py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-medium">Edit Booking</button>
    </div>
  </div>
</div>

<!-- ───── MODAL: Add/Edit Racket ───── -->
<div id="modal-racket-edit" class="modal-overlay hidden">
  <div class="modal-box max-w-sm">
    <div class="modal-header">
      <h3 id="modal-racket-title" class="font-semibold">Add Racket</h3>
      <button class="close-racket-modal text-white/80 hover:text-white text-xl leading-none">&times;</button>
    </div>
    <div class="p-5 space-y-4">
      <input type="hidden" id="re-id"/>
      <div><label class="form-label">Display Name <span class="text-red-500">*</span></label><input type="text" id="re-name" class="form-input" placeholder="e.g. Racket A"/></div>
      <div><label class="form-label">Model Name <span class="text-red-500">*</span></label><input type="text" id="re-model" class="form-input" placeholder="e.g. Yonex Astrox 88S"/></div>
      <div><label class="form-label">Price (Rp) <span class="text-red-500">*</span></label><input type="number" id="re-price" class="form-input" placeholder="20000" min="0"/></div>
      <div>
        <label class="form-label">Image (optional)</label>
        <input type="file" id="re-image" accept="image/*" class="form-input text-xs"/>
        <div id="re-img-preview" class="mt-2 hidden">
          <img id="re-preview-img" class="w-20 h-20 object-cover rounded-xl border border-gray-200"/>
        </div>
      </div>
      <div class="flex gap-3 pt-2">
        <button id="btn-save-racket" class="btn-primary flex-1">Save</button>
        <button class="close-racket-modal btn-secondary flex-1">Cancel</button>
      </div>
    </div>
  </div>
</div>

<style>
#tp-start::-webkit-slider-runnable-track,#tp-end::-webkit-slider-runnable-track{height:6px;background:#e5e7eb;border-radius:999px;}
#tp-start::-webkit-slider-thumb,#tp-end::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;background:#f97316;border-radius:50%;border:2px solid #fff;pointer-events:auto;cursor:pointer;box-shadow:0 0 0 3px rgba(249,115,22,0.15);}
#tp-start::-moz-range-track,#tp-end::-moz-range-track{height:6px;background:#e5e7eb;border-radius:999px;}
#tp-start::-moz-range-thumb,#tp-end::-moz-range-thumb{width:20px;height:20px;background:#f97316;border-radius:50%;border:2px solid #fff;pointer-events:auto;cursor:pointer;}
</style>`;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats(db) {
  const rows = unwrap(await db.rpc("get_racket_stats"));
  const s = rows[0] || {};
  const el = (id) => document.getElementById(id);
  if (el("racket-stats-available"))
    el("racket-stats-available").textContent = s.available ?? 0;
  if (el("racket-stats-rented"))
    el("racket-stats-rented").textContent = s.rented ?? 0;
}

// ── Racket Table ──────────────────────────────────────────────────────────────
async function loadRacketTable(db) {
  _racketData = unwrap(await db.rpc("get_racket_list"));
  renderRacketTable();
}

function renderRacketTable() {
  const tbody = document.getElementById("racket-table-body");
  if (!tbody) return;

  // Filter
  const q = _racketSearch.toLowerCase();
  let data = q
    ? _racketData.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.racket_name.toLowerCase().includes(q),
      )
    : [..._racketData];

  // Sort
  data.sort((a, b) => {
    const f = _racketSort.field;
    const av = f === "name" ? a[f].toLowerCase() : a[f];
    const bv = f === "name" ? b[f].toLowerCase() : b[f];
    return (av < bv ? -1 : av > bv ? 1 : 0) * (_racketSort.asc ? 1 : -1);
  });

  // Update sort icons
  ["name", "busy", "use_count"].forEach((f) => {
    const el = document.getElementById(`sort-icon-${f}`);
    if (!el) return;
    if (_racketSort.field !== f) {
      el.textContent = "↕";
      el.style.opacity = "0.3";
    } else {
      el.textContent = _racketSort.asc ? "↑" : "↓";
      el.style.opacity = "0.8";
    }
  });

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-td text-center text-gray-400 py-8">${_racketSearch ? "No matches" : "No rackets yet — click + Add"}</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map((r) => {
      const badge =
        r.status === 2
          ? `<span class="badge-red">N/A</span>`
          : r.busy === 1
            ? `<span class="badge-orange">Rented</span>`
            : `<span class="badge-green">Available</span>`;

      const endMs = r.current_end_str ? dtMs(r.current_end_str) : 0;
      const countdown = endMs
        ? `<span class="countdown text-xs font-mono" data-end="${endMs}"></span>`
        : `<span class="text-gray-300 text-sm">—</span>`;

      const imgHtml = r.image
        ? `<img src="${r.image}" class="w-8 h-8 rounded-lg object-cover flex-shrink-0"/>`
        : `<div class="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0 text-sm font-bold">${esc((r.name || "?").charAt(0).toUpperCase())}</div>`;

      return `<tr class="hover:bg-gray-50 group">
      <td class="table-td">
        <div class="flex items-center gap-2">
          ${imgHtml}
          <div>
            <div class="font-medium text-gray-800">${esc(r.name)}</div>
            <div class="text-xs text-gray-400">${esc(r.racket_name)}</div>
          </div>
        </div>
      </td>
      <td class="table-td text-center">${badge}</td>
      <td class="table-td text-center">${countdown}</td>
      <td class="table-td text-center">
        <div class="flex items-center justify-center gap-1.5">
          <span class="text-sm text-gray-700">${r.use_count}</span>
          ${
            _isManager
              ? `<button class="btn-edit-racket opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded transition-opacity font-medium"
            data-id="${r.id}" title="Edit racket">✎</button>`
              : ""
          }
        </div>
      </td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".btn-edit-racket").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const r = unwrap(
        await _db.from("racket").select("*").eq("id", btn.dataset.id).single(),
      );
      if (r) openRacketModal(r);
    });
  });

  updateCountdowns();
}

function updateCountdowns() {
  const now = Date.now();
  document.querySelectorAll(".countdown[data-end]").forEach((el) => {
    const endMs = parseInt(el.dataset.end, 10);
    if (!endMs) {
      el.textContent = "—";
      return;
    }
    const delta = endMs - now;
    if (delta > 0) {
      el.textContent = fmtCountdown(delta);
      el.style.color = "#f97316";
    } else {
      el.textContent = "Overdue " + fmtCountdown(-delta);
      el.style.color = "#ef4444";
    }
  });
}

// ── Rent Timeline ─────────────────────────────────────────────────────────────
function initRentOverview(db) {
  buildDayBar(_roState.y, _roState.m, _roState.d, db);
  updateShowingLine(_roState.y, _roState.m, _roState.d);
  loadRentGrid(db, _roState.y, _roState.m, _roState.d);

  document.getElementById("ro-month").addEventListener("change", function () {
    _roState.m = parseInt(this.value);
    _roState.d = Math.min(_roState.d, daysInMonth(_roState.y, _roState.m));
    buildDayBar(_roState.y, _roState.m, _roState.d, db);
    updateShowingLine(_roState.y, _roState.m, _roState.d);
    loadRentGrid(db, _roState.y, _roState.m, _roState.d);
  });
  document.getElementById("ro-year").addEventListener("change", function () {
    _roState.y = parseInt(this.value);
    _roState.d = Math.min(_roState.d, daysInMonth(_roState.y, _roState.m));
    buildDayBar(_roState.y, _roState.m, _roState.d, db);
    updateShowingLine(_roState.y, _roState.m, _roState.d);
    loadRentGrid(db, _roState.y, _roState.m, _roState.d);
  });
}

function buildDayBar(y, m, d, db) {
  const bar = document.getElementById("ro-day-bar");
  if (!bar) return;
  const dim = daysInMonth(y, m),
    ms = monthShort(y, m);
  bar.innerHTML = Array.from({ length: dim }, (_, i) => {
    const day = i + 1,
      active = day === d;
    return `<button class="ro-day-btn flex-shrink-0 text-center py-1.5 rounded-lg transition-all ${active ? "bg-orange-500 text-white shadow" : "bg-gray-100 text-gray-600 hover:bg-orange-100 hover:text-orange-600"}" style="min-width:38px;" data-day="${day}">
      <div class="text-sm font-bold leading-tight">${day}</div>
      <div class="leading-tight" style="font-size:9px;">${ms}</div>
    </button>`;
  }).join("");
  bar.querySelectorAll(".ro-day-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      _roState.d = parseInt(btn.dataset.day);
      buildDayBar(y, m, _roState.d, db);
      updateShowingLine(y, m, _roState.d);
      loadRentGrid(db, y, m, _roState.d);
    });
  });
  const active = bar.querySelector(".bg-orange-500");
  if (active)
    setTimeout(
      () =>
        active.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        }),
      0,
    );
}

function updateShowingLine(y, m, d) {
  const el = document.getElementById("ro-showing");
  if (el)
    el.textContent = `Showing ${new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
}

// ── Rent Timeline grid: rows = rackets, columns = hourly slots ────────────────
async function loadRentGrid(db, y, m, d) {
  const dateStr = `${y}-${pad(m)}-${pad(d)}`;
  const body = document.getElementById("ro-grid-body");
  if (!body) return;
  body.innerHTML = `<div class="flex items-center justify-center py-8"><div class="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>`;

  const rows = unwrap(await db.rpc("get_rent_history", { p_date: dateStr }));

  // Group by member + start + duration (same "session"), same logic used for edit
  const groups = new Map();
  for (const row of rows) {
    const ml = row.member_name || row.guest_name || "Guest";
    const startKey = getDateStr(row.start) + " " + getTimeStr(row.start);
    const key = `${ml}|${startKey}|${row.duration}`;
    if (!groups.has(key))
      groups.set(key, {
        memberLabel: ml,
        memberId: row.id_member,
        guestName: row.guest_name,
        start: row.start,
        duration: row.duration,
        items: [],
      });
    groups.get(key).items.push(row);
  }

  _gridRowMap = new Map(rows.map((r) => [r.id, r]));
  _gridGroupMap = new Map();
  groups.forEach((g) => g.items.forEach((r) => _gridGroupMap.set(r.id, g)));

  renderRentGrid(rows, dateStr);
}

function renderRentGrid(rows, dateStr) {
  const body = document.getElementById("ro-grid-body");
  if (!body) return;

  const byRacket = new Map();
  rows.forEach((r) => {
    if (!byRacket.has(r.id_racket)) byRacket.set(r.id_racket, []);
    byRacket.get(r.id_racket).push(r);
  });

  const q = _roSearch.toLowerCase();
  let rackets = _racketData;
  if (q) {
    rackets = _racketData.filter((rk) => {
      if (
        rk.name.toLowerCase().includes(q) ||
        rk.racket_name.toLowerCase().includes(q)
      )
        return true;
      const bookings = byRacket.get(rk.id) || [];
      return bookings.some((b) =>
        (b.member_name || b.guest_name || "").toLowerCase().includes(q),
      );
    });
  }

  if (!rackets.length) {
    body.innerHTML = `<p class="text-center text-gray-400 py-8 text-sm">${_racketData.length ? "No matches" : "No rackets yet"}</p>`;
    return;
  }

  const nowMs = Date.now();
  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  const currentHour = new Date().getHours();

  body.innerHTML = rackets
    .map((rk) => {
      const bookings = byRacket.get(rk.id) || [];

      const cells = Array.from({ length: GRID_SLOT_COUNT }, (_, i) => {
        const hour = GRID_START_HOUR + i;
        const past = isToday && hour < currentHour;
        return `<div class="rt-hour-cell ${past ? "rt-hour-past" : ""}" data-hour="${hour}" data-racket-id="${rk.id}"></div>`;
      }).join("");

      const blocks = bookings
        .map((b) => {
          const startHour = Math.max(
            GRID_START_HOUR,
            Math.min(23, new Date(b.start.replace(" ", "T")).getHours()),
          );
          const dur = b.duration;
          const leftPct =
            ((startHour - GRID_START_HOUR) / GRID_SLOT_COUNT) * 100;
          const widthPct = (dur / GRID_SLOT_COUNT) * 100;
          const startMs = dtMs(b.start);
          const endMs = startMs + dur * 3600000;
          const isLive = nowMs >= startMs && nowMs < endMs;
          const isPast = nowMs >= endMs;
          const label = b.member_name || b.guest_name || "Guest";

          let cls = "rt-block-booked";
          if (b.status === 2) cls = "rt-block-cancelled";
          else if (b.status === 1) cls = "rt-block-returned";
          else if (isLive) cls = "rt-block-live";
          else if (isPast) cls = "rt-block-ended";

          const endHour = new Date(endMs).getHours() || 24;
          const timeLabel = `${fmtH(startHour)}–${fmtH(endHour === 0 ? 24 : endHour)}`;

      const racketImg = rk.image
    ? `<img src="${rk.image}" class="rt-block-img"/>`
    : `<div class="rt-block-placeholder">
          ${esc((rk.name || '?').charAt(0))}
       </div>`;

return `
<div
    class="rt-block ${cls}"
    style="left:${leftPct}%;width:${widthPct}%"
    data-row-id="${b.id}"
    title="${esc(label)} · ${timeLabel}"
>
    ${racketImg}

    <div class="rt-block-info">
  <div class="rt-block-racket">
    <span class="rt-block-code">
        ${esc(rk.name)} -
    </span>

    ${rk.racket_name ? `
        <span class="rt-block-detail">
            ${esc(rk.racket_name)}
        </span>
    ` : ""}
</div>

    <div class="rt-block-member">
    <svg class="rt-member-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/>
    </svg>

    <span>${esc(label)}</span>
</div>
    </div>
</div>
`;
        })
        .join("");

      const imgHtml = rk.image
        ? `<img src="${rk.image}" class="w-7 h-7 rounded-lg object-cover flex-shrink-0"/>`
        : `<div class="w-7 h-7 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0 text-xs font-bold">${esc((rk.name || "?").charAt(0).toUpperCase())}</div>`;

      return `<div class="rt-row">
    
      <div class="rt-hours-track">
        ${cells}
        ${blocks}
      </div>
    </div>`;
    })
    .join("");

  // Empty-cell clicks → start a new booking prefilled with this racket + time
  body.querySelectorAll(".rt-hour-cell:not(.rt-hour-past)").forEach((cell) => {
    cell.addEventListener("click", () => {
      const hour = parseInt(cell.dataset.hour);
      const racketId = cell.dataset.racketId;
      openMemberModal(_db, { date: dateStr, startH: hour, racketId });
    });
  });

  // Block clicks → booking detail (return / cancel / edit)
  body.querySelectorAll(".rt-block[data-row-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openBlockDetail(parseInt(el.dataset.rowId));
    });
  });
}

// ── Booking Detail Modal ──────────────────────────────────────────────────────
function openBlockDetail(rowId) {
  const row = _gridRowMap.get(rowId);
  const group = _gridGroupMap.get(rowId);
  if (!row) return;

  const nowMs = Date.now();
  const startMs = dtMs(row.start);
  const endMs = startMs + row.duration * 3600000;
  const isLive = nowMs >= startMs && nowMs < endMs;
  const isPast = nowMs >= endMs;
  const label = row.member_name || row.guest_name || "Guest";
  const endHour = new Date(endMs).getHours() || 24;

  document.getElementById("bd-title").textContent =
    `${row.racket_name || ""}${row.racket_model ? " — " + row.racket_model : ""}`;
  document.getElementById("bd-member").textContent = label;
  document.getElementById("bd-time").textContent =
    `${getTimeStr(row.start)} – ${fmtH(endHour === 0 ? 24 : endHour)} (${row.duration}h)`;
  document.getElementById("bd-price").textContent = idr(
    row.unit_price || row.total_price || 0,
  );

  const btnReturn = document.getElementById("bd-btn-return");
  const btnCancel = document.getElementById("bd-btn-cancel");
  const btnEdit = document.getElementById("bd-btn-edit");

  const canReturn = row.status === 0 && (isLive || isPast);
  const canCancel = row.status === 0 && !isLive && !isPast;
  const canEdit = row.status === 0;

  btnReturn.classList.toggle("hidden", !canReturn);
  btnCancel.classList.toggle("hidden", !canCancel);
  btnEdit.classList.toggle("hidden", !canEdit);

  btnReturn.onclick = async () => {
    if (!window.confirm("Mark as returned?")) return;
    unwrap(await _db.from("rent_log").update({ status: 1 }).eq("id", row.id));
    unwrap(
      await _db.from("racket").update({ status: 0 }).eq("id", row.id_racket),
    );
    toast("Marked as returned");
    closeBlockDetail();
    await loadStats(_db);
    await loadRacketTable(_db);
    await loadRentGrid(_db, _roState.y, _roState.m, _roState.d);
  };
  btnCancel.onclick = async () => {
    if (!window.confirm("Cancel this booking?")) return;
    unwrap(await _db.from("rent_log").update({ status: 2 }).eq("id", row.id));
    toast("Booking cancelled");
    closeBlockDetail();
    await loadStats(_db);
    await loadRacketTable(_db);
    await loadRentGrid(_db, _roState.y, _roState.m, _roState.d);
  };
  btnEdit.onclick = () => {
    closeBlockDetail();
    if (!group) return;
    const activeIds = group.items
      .filter((r) => r.status === 0)
      .map((r) => r.id);
    if (!activeIds.length) return;
    openEditGroupFlow({
      ids: activeIds,
      start: group.start,
      duration: group.duration,
      member: group.memberLabel,
      memberId: group.memberId || 0,
      guestName: group.guestName || "",
    });
  };

  document.getElementById("modal-block-detail").classList.remove("hidden");
}

function closeBlockDetail() {
  document.getElementById("modal-block-detail").classList.add("hidden");
}

// ── Member Modal ──────────────────────────────────────────────────────────────
async function openMemberModal(db, prefill = null) {
  _cellPrefill = prefill;
  _editingRentId = null;
  _editingMeta = {};
  document.getElementById("mp-guest-name").value = "";
  document.getElementById("mp-search").value = "";
  document.getElementById("modal-member-pick").classList.remove("hidden");
  await loadMemberList(db, "");
}

async function loadMemberList(db, q) {
  const rows = unwrap(
    await db
      .from("members")
      .select("id, member_name, status")
      .ilike("member_name", `%${q}%`)
      .order("member_name")
      .limit(50),
  );
  const tbody = document.getElementById("mp-member-list");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-td text-center text-gray-400 py-4">No members found</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((m) => {
      const badge =
        m.status === 0
          ? `<span class="badge-green" style="font-size:10px;">Active</span>`
          : `<span class="badge-gray" style="font-size:10px;">Inactive</span>`;
      return `<tr class="hover:bg-gray-50">
      <td class="table-td text-xs">${m.id}</td>
      <td class="table-td text-xs font-medium">${esc(m.member_name)}</td>
      <td class="table-td">${badge}</td>
      <td class="table-td text-right">
        <button class="btn-pick-member text-xs px-2 py-1 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg font-medium"
          data-id="${m.id}" data-name="${esc(m.member_name)}">Pick</button>
      </td>
    </tr>`;
    })
    .join("");
  tbody.querySelectorAll(".btn-pick-member").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("modal-member-pick").classList.add("hidden");
      openTimeModal(btn.dataset.id, btn.dataset.name, "");
    });
  });
}

// ── Time Modal + Slider ───────────────────────────────────────────────────────
function openTimeModal(memberId, memberName, guestName, existingData = null) {
  document.getElementById("tp-member-id").value = memberId || "";
  document.getElementById("tp-guest-name").value = guestName || "";

  // Context bar for edit mode
  const ctxBar = document.getElementById("tp-context-bar");
  const ctxMember = document.getElementById("tp-context-member");
  const tpDate = document.getElementById("tp-date");
  if (existingData) {
    ctxBar.classList.remove("hidden");
    ctxMember.textContent = memberName;
    // Remove date restrictions for editing past bookings
    tpDate.removeAttribute("min");
    tpDate.removeAttribute("max");
    tpDate.value = existingData.date;
    document.getElementById("tp-start").value = existingData.startH;
    document.getElementById("tp-end").value = Math.min(
      existingData.startH + existingData.duration,
      23,
    );
    document.getElementById("tp-modal-title").textContent = "Edit Booking";
    // In single-edit mode allow only 1 racket; group edit allows re-selecting
    const isSingleEdit = !!_editingRentId;
    document.getElementById("tp-check-all").style.display = isSingleEdit
      ? "none"
      : "";
    document.getElementById("tp-checkall-label").textContent = isSingleEdit
      ? "Select one racket"
      : "Select all";
  } else {
    ctxBar.classList.add("hidden");
    if (_cellPrefill) {
      setTpDateToday();
      tpDate.value = _cellPrefill.date;
      document.getElementById("tp-start").value = _cellPrefill.startH;
      document.getElementById("tp-end").value = Math.min(
        _cellPrefill.startH + 1,
        23,
      );
    } else {
      setTpDateToday();
      document.getElementById("tp-start").value = 6;
      document.getElementById("tp-end").value = 7;
    }
    document.getElementById("tp-modal-title").textContent =
      "Pick Date & Time Range";
    document.getElementById("tp-check-all").style.display = "";
    document.getElementById("tp-checkall-label").textContent = "Select all";
  }

  clampSlider();
  updateSlider();
  document.getElementById("tp-avail-box").classList.add("hidden");
  document.getElementById("modal-time-pick").classList.remove("hidden");

  if (existingData) {
    // Auto-load availability immediately in edit mode
    setTimeout(() => checkAvailability(), 100);
  } else if (_cellPrefill) {
    // Auto-load availability and pre-check the racket that was clicked on the grid
    const prefillRacketId = String(_cellPrefill.racketId);
    setTimeout(async () => {
      await checkAvailability();
      const cb = document.querySelector(
        `#tp-avail-body .av-cb[value="${prefillRacketId}"]`,
      );
      if (cb) {
        cb.checked = true;
        updateAvailTotals();
        syncAvailMaster();
      }
      _cellPrefill = null;
    }, 100);
  }
}

function openEditFlow(row) {
  _editingRentId = parseInt(row.id);
  _editingGroupIds = null;
  _editingMeta = {
    memberId: row.memberId,
    memberName: row.member,
    guestName: row.guestName,
  };
  const startH = new Date((row.start || "").replace(" ", "T")).getHours();
  const date = getDateStr(row.start);
  openTimeModal(row.memberId, row.member, row.guestName, {
    date,
    startH,
    endH: Math.min(startH + row.duration, 23),
    duration: row.duration,
  });
}

function openEditGroupFlow(row) {
  _editingRentId = null;
  _editingGroupIds = row.ids; // array of rent_log IDs
  _editingMeta = {
    memberId: row.memberId,
    memberName: row.member,
    guestName: row.guestName,
  };
  const startH = new Date((row.start || "").replace(" ", "T")).getHours();
  const date = getDateStr(row.start);
  openTimeModal(row.memberId, row.member, row.guestName, {
    date,
    startH,
    endH: Math.min(startH + row.duration, 23),
    duration: row.duration,
  });
}

function initSlider() {
  const start = document.getElementById("tp-start");
  const end = document.getElementById("tp-end");
  if (!start || !end) return;
  start.addEventListener("input", () => {
    clampSlider();
    updateSlider();
    maybeAutoCheck();
  });
  end.addEventListener("input", () => {
    clampSlider();
    updateSlider();
    maybeAutoCheck();
  });
  updateSlider();
}

function clampSlider() {
  const s = document.getElementById("tp-start"),
    e = document.getElementById("tp-end");
  let sv = parseInt(s.value),
    ev = parseInt(e.value);
  if (ev <= sv) ev = sv + 1;
  if (ev > 23) {
    ev = 23;
    if (sv >= 23) sv = 22;
  }
  s.value = sv;
  e.value = ev;
}

function updateSlider() {
  const sv = parseInt(document.getElementById("tp-start").value);
  const ev = parseInt(document.getElementById("tp-end").value);
  document.getElementById("tp-start-lbl").textContent = fmtH(sv);
  document.getElementById("tp-end-lbl").textContent = fmtH(ev);
  document.getElementById("tp-dur-bubble").textContent = `${ev - sv}h`;
  const MIN = 6,
    MAX = 23,
    pct = (v) => ((v - MIN) / (MAX - MIN)) * 100;
  const l = pct(sv),
    r = pct(ev);
  const fill = document.getElementById("tp-fill");
  const bubble = document.getElementById("tp-dur-bubble");
  if (fill) {
    fill.style.left = l + "%";
    fill.style.width = r - l + "%";
  }
  if (bubble) bubble.style.left = (l + r) / 2 + "%";
}

function maybeAutoCheck() {
  const box = document.getElementById("tp-avail-box");
  if (box && !box.classList.contains("hidden")) {
    clearTimeout(_availTimer);
    _availTimer = setTimeout(() => checkAvailability(), 200);
  }
}

// ── Availability Check ────────────────────────────────────────────────────────
async function checkAvailability() {
  const date = document.getElementById("tp-date").value;
  const startH = parseInt(document.getElementById("tp-start").value);
  const endH = parseInt(document.getElementById("tp-end").value);
  if (!date || endH <= startH) return;

  const startStr = `${date} ${pad(startH)}:00:00`;
  const endStr = `${date} ${pad(endH)}:00:00`;
  // For single edit: exclude that booking's racket. For group edit: pass first ID (RPC shows available + excluded racket)
  const excludeId = _editingRentId || _editingGroupIds?.[0] || 0;

  const rackets = unwrap(
    await _db.rpc("get_available_rackets", {
      p_start: startStr,
      p_end: endStr,
      p_exclude_id: excludeId,
    }),
  );

  const box = document.getElementById("tp-avail-box");
  const tbody = document.getElementById("tp-avail-body");
  box.classList.remove("hidden");

  if (!rackets.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-td text-center text-gray-400 py-4">No rackets available for this slot</td></tr>`;
    updateAvailTotals();
    return;
  }

  tbody.innerHTML = rackets
    .map((r) => {
      const img = r.image
        ? `<img src="${r.image}" class="w-6 h-6 rounded object-cover flex-shrink-0"/>`
        : `<div class="w-6 h-6 rounded bg-orange-50 text-orange-500 flex items-center justify-center text-xs font-bold flex-shrink-0">${esc((r.name || "?").charAt(0))}</div>`;
      return `<tr class="hover:bg-gray-50 av-row cursor-pointer">
      <td class="table-td text-center"><input type="checkbox" class="av-cb accent-orange-500" value="${r.id}" data-price="${r.price}" data-name="${esc(r.name)}"/></td>
      <td class="table-td text-xs">
        <div class="flex items-center gap-2">${img}<span class="font-medium">${esc(r.name)}</span></div>
      </td>
      <td class="table-td text-xs text-gray-400">${esc(r.racket_name || "")}</td>
      <td class="table-td text-xs text-right font-semibold">${idr(r.price)}</td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".av-row").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      const cb = tr.querySelector(".av-cb");
      if (!cb) return;
      if (_editingRentId) {
        // Edit mode: only one selection at a time
        tbody.querySelectorAll(".av-cb").forEach((c) => {
          if (c !== cb) c.checked = false;
        });
      }
      cb.checked = !cb.checked;
      updateAvailTotals();
      syncAvailMaster();
    });
  });
  tbody.querySelectorAll(".av-cb").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (_editingRentId) {
        // Deselect others
        tbody.querySelectorAll(".av-cb").forEach((c) => {
          if (c !== cb && cb.checked) c.checked = false;
        });
      }
      updateAvailTotals();
      syncAvailMaster();
    });
  });

  const master = document.getElementById("tp-check-all");
  if (master) master.checked = false;
  if (master) master.indeterminate = false;
  updateAvailTotals();
}

function getAvailChecked() {
  return Array.from(document.querySelectorAll("#tp-avail-body .av-cb:checked"));
}

function updateAvailTotals() {
  const checked = getAvailChecked();
  const subtotal = checked.reduce(
    (s, cb) => s + (parseInt(cb.dataset.price) || 0),
    0,
  );
  const el = (id) => document.getElementById(id);
  if (el("tp-sel-count")) el("tp-sel-count").textContent = checked.length;
  if (el("tp-sel-subtotal")) el("tp-sel-subtotal").textContent = idr(subtotal);
  const rentBtn = el("tp-rent-now-btn");
  if (rentBtn) rentBtn.disabled = checked.length === 0;
}

function syncAvailMaster() {
  const all = document.querySelectorAll("#tp-avail-body .av-cb");
  const chk = getAvailChecked();
  const master = document.getElementById("tp-check-all");
  if (!master) return;
  master.indeterminate = chk.length > 0 && chk.length < all.length;
  master.checked = all.length > 0 && chk.length === all.length;
}

// ── Confirm & Submit ──────────────────────────────────────────────────────────
function openConfirmModal() {
  const memberId = document.getElementById("tp-member-id").value;
  const guestName = document.getElementById("tp-guest-name").value;
  const date = document.getElementById("tp-date").value;
  const startH = parseInt(document.getElementById("tp-start").value);
  const endH = parseInt(document.getElementById("tp-end").value);
  const dur = endH - startH;
  const checked = getAvailChecked();
  const subtotal = checked.reduce(
    (s, cb) => s + (parseInt(cb.dataset.price) || 0),
    0,
  );

  if (_editingRentId && checked.length > 1) {
    toast("Select only ONE racket when editing a single booking", "error");
    return;
  }

  const memberLabel = guestName ? `Guest: ${guestName}` : `Member #${memberId}`;

  document.getElementById("cr-modal-title").textContent =
    _editingRentId || _editingGroupIds ? "Confirm Edit" : "Confirm Rent";
  document.getElementById("cr-member").textContent = memberLabel;
  document.getElementById("cr-date").textContent = date;
  document.getElementById("cr-time").textContent =
    `${fmtH(startH)} – ${fmtH(endH)} (${dur}h)`;
  document.getElementById("cr-count").textContent =
    `${checked.length} racket${checked.length > 1 ? "s" : ""}`;
  document.getElementById("cr-total").textContent = idr(subtotal);

  _rentPending = {
    memberId: parseInt(memberId) || 0,
    guestName,
    date,
    startH,
    endH,
    dur,
    rackets: checked.map((cb) => ({
      id: cb.value,
      price: parseInt(cb.dataset.price) || 0,
      name: cb.dataset.name,
    })),
    total: subtotal,
  };
  document.getElementById("modal-confirm-rent").classList.remove("hidden");
}

async function submitRent() {
  const { memberId, guestName, date, startH, dur, rackets } = _rentPending;
  const startStr = `${date} ${pad(startH)}:00:00`;
  const endStr = `${date} ${pad(startH + dur)}:00:00`;

  try {
    if (_editingGroupIds) {
      // ── GROUP EDIT MODE — update all active rows in the group ──
      if (!rackets.length) {
        toast("Select at least one racket", "error");
        return;
      }

      // Get old racket IDs
      const oldRows = unwrap(
        await _db
          .from("rent_log")
          .select("id, id_racket")
          .in("id", _editingGroupIds),
      );
      const oldRacketIds = new Set(oldRows.map((r) => String(r.id_racket)));
      const newRacketIds = new Set(rackets.map((r) => String(r.id)));

      // Overlap check for each new racket
      for (const r of rackets) {
        const overlap = unwrap(
          await _db.rpc("check_rent_overlap", {
            p_racket_id: parseInt(r.id),
            p_start: startStr,
            p_end: endStr,
            p_exclude_id: 0,
          }),
        );
        // filter out rows that are part of this group
        const realOverlap = overlap.filter(
          (o) => !_editingGroupIds.includes(o.id),
        );
        if (realOverlap.length) {
          toast(`"${r.name}" has a conflicting booking`, "error");
          return;
        }
      }

      // Cancel old bookings that are no longer in the new selection
      for (const oldRow of oldRows) {
        if (!newRacketIds.has(String(oldRow.id_racket))) {
          unwrap(
            await _db
              .from("rent_log")
              .update({ status: 2 })
              .eq("id", oldRow.id),
          );
          unwrap(
            await _db
              .from("racket")
              .update({ status: 0 })
              .eq("id", oldRow.id_racket),
          );
        }
      }

      // Update or insert bookings for each selected racket
      for (const r of rackets) {
        const existing = oldRows.find(
          (o) => String(o.id_racket) === String(r.id),
        );
        if (existing) {
          unwrap(
            await _db
              .from("rent_log")
              .update({
                start: startStr,
                duration: dur,
                unit_price: r.price,
                total_price: r.price,
              })
              .eq("id", existing.id),
          );
        } else {
          // New racket added to the group
          unwrap(
            await _db.from("rent_log").insert({
              id_member: memberId > 0 ? memberId : null,
              id_racket: parseInt(r.id),
              guest_name: guestName || "",
              status: 0,
              start: startStr,
              duration: dur,
              unit_price: r.price,
              total_price: r.price,
            }),
          );
          unwrap(await _db.from("racket").update({ status: 1 }).eq("id", r.id));
        }
      }

      toast("Booking updated");
      _editingGroupIds = null;
    } else if (_editingRentId) {
      // ── SINGLE EDIT MODE ──
      const r = rackets[0];
      if (!r) {
        toast("No racket selected", "error");
        return;
      }

      const overlap = unwrap(
        await _db.rpc("check_rent_overlap", {
          p_racket_id: parseInt(r.id),
          p_start: startStr,
          p_end: endStr,
          p_exclude_id: _editingRentId,
        }),
      );
      if (overlap.length) {
        toast(`"${r.name}" has a conflicting booking`, "error");
        return;
      }

      const old = unwrap(
        await _db
          .from("rent_log")
          .select("id_racket")
          .eq("id", _editingRentId)
          .single(),
      );
      const oldRacketId = old?.id_racket;

      unwrap(
        await _db
          .from("rent_log")
          .update({
            start: startStr,
            duration: dur,
            id_racket: parseInt(r.id),
            unit_price: r.price,
            total_price: r.price,
          })
          .eq("id", _editingRentId),
      );

      if (String(oldRacketId) !== String(r.id)) {
        unwrap(
          await _db.from("racket").update({ status: 0 }).eq("id", oldRacketId),
        );
        unwrap(await _db.from("racket").update({ status: 1 }).eq("id", r.id));
      }
      toast("Booking updated");
      _editingRentId = null;
    } else {
      // ── NEW BOOKING ──
      for (const r of rackets) {
        const overlap = unwrap(
          await _db.rpc("check_rent_overlap", {
            p_racket_id: parseInt(r.id),
            p_start: startStr,
            p_end: endStr,
            p_exclude_id: 0,
          }),
        );
        if (overlap.length) {
          toast(`"${r.name}" is no longer available`, "error");
          return;
        }

        unwrap(
          await _db.from("rent_log").insert({
            id_member: memberId > 0 ? memberId : null,
            id_racket: parseInt(r.id),
            guest_name: guestName || "",
            status: 0,
            start: startStr,
            duration: dur,
            unit_price: r.price,
            total_price: r.price,
          }),
        );
        unwrap(
          await _db
            .from("racket")
            .update({
              use_count:
                (
                  await unwrap(
                    await _db
                      .from("racket")
                      .select("use_count")
                      .eq("id", r.id)
                      .single(),
                  )
                ).use_count + 1,
              status: 1,
            })
            .eq("id", r.id),
        );
      }
      toast(
        `${rackets.length} booking${rackets.length > 1 ? "s" : ""} created!`,
      );
    }

    document.getElementById("modal-confirm-rent").classList.add("hidden");
    document.getElementById("modal-time-pick").classList.add("hidden");
    await loadStats(_db);
    await loadRacketTable(_db);
    const { y, m, d } = _roState;
    if (date === `${y}-${pad(m)}-${pad(d)}`) await loadRentGrid(_db, y, m, d);
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

// ── Add/Edit Racket Modal ─────────────────────────────────────────────────────
function openRacketModal(data = null) {
  document.getElementById("modal-racket-title").textContent = data
    ? "Edit Racket"
    : "Add Racket";
  document.getElementById("re-id").value = data?.id || "";
  document.getElementById("re-name").value = data?.name || "";
  document.getElementById("re-model").value = data?.racket_name || "";
  document.getElementById("re-price").value = data?.price || "";
  document.getElementById("re-image").value = "";
  if (data?.image) {
    document.getElementById("re-preview-img").src = data.image;
    document.getElementById("re-img-preview").classList.remove("hidden");
  } else {
    document.getElementById("re-img-preview").classList.add("hidden");
  }
  document.getElementById("modal-racket-edit").classList.remove("hidden");
}

async function saveRacket(db) {
  const id = document.getElementById("re-id").value;
  const name = document.getElementById("re-name").value.trim();
  const model = document.getElementById("re-model").value.trim();
  const price = parseInt(document.getElementById("re-price").value) || 0;
  if (!name || !model) {
    toast("Name and model are required", "error");
    return;
  }
  if (price <= 0) {
    toast("Price must be > 0", "error");
    return;
  }

  let imageData = "";
  const file = document.getElementById("re-image").files[0];
  if (file) {
    imageData = await fileToBase64(file);
  } else if (id) {
    const existing = unwrap(
      await db.from("racket").select("image").eq("id", id).single(),
    );
    imageData = existing?.image || "";
  }

  if (id) {
    unwrap(
      await db
        .from("racket")
        .update({ name, racket_name: model, price, image: imageData })
        .eq("id", id),
    );
    toast("Racket updated");
  } else {
    unwrap(
      await db
        .from("racket")
        .insert({ name, racket_name: model, price, image: imageData }),
    );
    toast("Racket added");
  }
  document.getElementById("modal-racket-edit").classList.add("hidden");
  await loadStats(db);
  await loadRacketTable(db);
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function initEventListeners(db) {
  // Racket list — search
  document.getElementById("rl-search")?.addEventListener("input", (e) => {
    _racketSearch = e.target.value.trim();
    renderRacketTable();
  });

  // Racket list — sort headers
  document.querySelectorAll("[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const f = th.dataset.sort;
      if (_racketSort.field === f) _racketSort.asc = !_racketSort.asc;
      else {
        _racketSort.field = f;
        _racketSort.asc = true;
      }
      renderRacketTable();
    });
  });

  // Rent timeline — search
  document.getElementById("ro-search")?.addEventListener("input", (e) => {
    _roSearch = e.target.value.trim().toLowerCase();
    loadRentGrid(db, _roState.y, _roState.m, _roState.d);
  });

  // Rent new & add racket
  document
    .getElementById("btn-rent-new")
    ?.addEventListener("click", () => openMemberModal(db));
  document
    .getElementById("btn-add-racket")
    ?.addEventListener("click", () => openRacketModal());
  document
    .getElementById("btn-save-racket")
    ?.addEventListener("click", () => saveRacket(db));
  document
    .querySelectorAll(".close-racket-modal")
    .forEach((b) =>
      b.addEventListener("click", () =>
        document.getElementById("modal-racket-edit").classList.add("hidden"),
      ),
    );
  document.getElementById("re-image")?.addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const b64 = await fileToBase64(f);
    document.getElementById("re-preview-img").src = b64;
    document.getElementById("re-img-preview").classList.remove("hidden");
  });

  // Member modal
  document
    .getElementById("close-member-modal")
    ?.addEventListener("click", () => {
      document.getElementById("modal-member-pick").classList.add("hidden");
      _cellPrefill = null;
    });
  document
    .getElementById("mp-search")
    ?.addEventListener("input", (e) =>
      loadMemberList(db, e.target.value.trim()),
    );
  document.getElementById("mp-use-guest")?.addEventListener("click", () => {
    const name = document.getElementById("mp-guest-name").value.trim();
    if (!name) {
      toast("Enter a guest name", "error");
      return;
    }
    document.getElementById("modal-member-pick").classList.add("hidden");
    openTimeModal("", "", name);
  });

  // Time modal
  document.getElementById("close-time-modal")?.addEventListener("click", () => {
    document.getElementById("modal-time-pick").classList.add("hidden");
    _editingRentId = null;
    _editingGroupIds = null;
    _editingMeta = {};
    _cellPrefill = null;
  });
  document.getElementById("tp-back-btn")?.addEventListener("click", () => {
    document.getElementById("modal-time-pick").classList.add("hidden");
    if (!_editingRentId) openMemberModal(db);
  });
  document
    .getElementById("tp-check-btn")
    ?.addEventListener("click", () => checkAvailability());
  document
    .getElementById("tp-date")
    ?.addEventListener("change", () =>
      document.getElementById("tp-avail-box").classList.add("hidden"),
    );
  document.getElementById("tp-check-all")?.addEventListener("change", (e) => {
    if (_editingRentId) return; // no select-all in edit mode
    document
      .querySelectorAll("#tp-avail-body .av-cb")
      .forEach((cb) => (cb.checked = e.target.checked));
    updateAvailTotals();
  });
  document.getElementById("tp-avail-search")?.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll("#tp-avail-body tr").forEach((tr) => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });
  document
    .getElementById("tp-rent-now-btn")
    ?.addEventListener("click", () => openConfirmModal());

  // Confirm modal
  document
    .getElementById("close-confirm-modal")
    ?.addEventListener("click", () =>
      document.getElementById("modal-confirm-rent").classList.add("hidden"),
    );
  document
    .getElementById("close-confirm-modal-2")
    ?.addEventListener("click", () =>
      document.getElementById("modal-confirm-rent").classList.add("hidden"),
    );
  document
    .getElementById("cr-submit-btn")
    ?.addEventListener("click", () => submitRent());

  // Booking detail modal (from timeline)
  document
    .getElementById("close-block-detail")
    ?.addEventListener("click", () => closeBlockDetail());
}
