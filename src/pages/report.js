import { idr, fmtDate } from "../utils.js";
import { unwrap } from "../db.js";

export async function renderReport(container, db, role = 'manager') {
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);

    container.innerHTML = `
    <div class="space-y-5">
      <div class="card p-0 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100">
          <h3 class="text-lg font-semibold text-gray-800">Daily / Monthly Report</h3>
          <p class="text-sm text-gray-500">Summary of F&amp;B sales and racket rental records</p>
        </div>

        <!-- Filter bar -->
        <div class="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-100">
          <div class="flex rounded-xl overflow-hidden border border-gray-200">
            <button id="rpt-mode-day" class="rpt-mode-btn px-4 py-1.5 text-sm font-medium bg-orange-500 text-white">Day</button>
            <button id="rpt-mode-month" class="rpt-mode-btn px-4 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50">Month</button>
          </div>
          <input type="date" id="rpt-date" value="${today}" class="form-input w-auto"/>
          <input type="month" id="rpt-month" value="${thisMonth}" class="form-input w-auto hidden"/>
        </div>

        <!-- Total sales banner -->
        <div id="rpt-totals" class="hidden px-5 py-4 border-b border-gray-100">
          <div class="grid grid-cols-3 gap-4">
            <div class="stat-card flex items-center gap-3">
              <div class="stat-icon bg-orange-50">
                <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              </div>
              <div>
                <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">F&amp;B Revenue</p>
                <p id="rpt-fnb-total" class="text-xl font-bold text-gray-900 mt-0.5">Rp 0</p>
                <p id="rpt-fnb-count" class="text-xs text-gray-400"></p>
              </div>
            </div>   
            <div class="stat-card flex items-center gap-3 border-2 border-orange-200 bg-orange-50">
              <div class="stat-icon bg-orange-100">
                <svg class="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div>
                <p class="text-xs font-bold text-orange-500 uppercase tracking-widest">Total Sales</p>
                <p id="rpt-grand-total" class="text-2xl font-bold text-orange-600 mt-0.5">Rp 0</p>
                <p id="rpt-total-count" class="text-xs text-orange-400"></p>
              </div>
            </div>
            <div class="stat-card flex items-center gap-3">
              <div class="stat-icon bg-blue-50">
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div>
                <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">Racket Revenue</p>
                <p id="rpt-racket-total" class="text-xl font-bold text-gray-900 mt-0.5">Rp 0</p>
                <p id="rpt-racket-count" class="text-xs text-gray-400"></p>
              </div>
            </div>
         
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 px-5 border-b border-gray-200">
          <button id="rpt-tab-fnb" class="rpt-tab px-4 py-2 text-sm font-medium border-b-2 border-orange-500 text-orange-600">F&amp;B Sales</button>
          <button id="rpt-tab-rental" class="rpt-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">Racket Rentals</button>
        </div>

        <div id="rpt-content" class="p-5">
          <p class="text-center text-gray-400 py-12 text-sm">Select a period and click Load Report</p>
        </div>
      </div>
    </div>
  `;

    let activeTab = "fnb";
    let lastFnbRows = [];
    let lastRentalRows = [];

    function setTab(tab) {
        activeTab = tab;
        document.getElementById("rpt-tab-fnb").className =
            `rpt-tab px-4 py-2 text-sm font-medium border-b-2 ${tab === "fnb" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`;
        document.getElementById("rpt-tab-rental").className =
            `rpt-tab px-4 py-2 text-sm font-medium border-b-2 ${tab === "rental" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`;
        renderTab();
    }

    function renderTab() {
        if (activeTab === "fnb") renderFnbTable(lastFnbRows);
        else renderRentalTable(lastRentalRows);
    }

    // Mode toggle
    let mode = "day";

    async function loadReport() {
        let from, to;
        if (mode === "day") {
            from = document.getElementById("rpt-date").value;
            to = from;
        } else {
            const m = document.getElementById("rpt-month").value;
            from = m + "-01";
            const [y, mo] = m.split("-").map(Number);
            const lastDay = new Date(y, mo, 0).getDate();
            to = `${m}-${String(lastDay).padStart(2, "0")}`;
        }

        const content = document.getElementById("rpt-content");
        content.innerHTML = `<div class="flex justify-center py-8"><div class="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div></div>`;

        const [fnbRows, rentalRows] = await Promise.all([
            unwrap(
                await db.rpc("get_fnb_transactions", {
                    date_from: from,
                    date_to: to,
                }),
            ),
            unwrap(
                await db.rpc("get_rental_transactions", {
                    date_from: from,
                    date_to: to,
                }),
            ),
        ]);

        lastFnbRows = fnbRows;
        lastRentalRows = rentalRows;

        const fnbTotal = fnbRows.reduce((s, r) => s + (r.total_price || 0), 0);
        const racketTotal = rentalRows
            .filter((r) => r.status !== 2)
            .reduce((s, r) => s + (r.total_price || 0), 0);
        const grandTotal = fnbTotal + racketTotal;

        document.getElementById("rpt-totals").classList.remove("hidden");
        document.getElementById("rpt-fnb-total").textContent = idr(fnbTotal);
        document.getElementById("rpt-fnb-count").textContent =
            `${fnbRows.length} transaction${fnbRows.length !== 1 ? "s" : ""}`;
        document.getElementById("rpt-racket-total").textContent =
            idr(racketTotal);
        document.getElementById("rpt-racket-count").textContent =
            `${rentalRows.length} rental${rentalRows.length !== 1 ? "s" : ""}`;
        document.getElementById("rpt-grand-total").textContent =
            idr(grandTotal);
        document.getElementById("rpt-total-count").textContent =
            `${fnbRows.length + rentalRows.length} total records`;

        renderTab();
    }

    document.getElementById("rpt-mode-day").addEventListener("click", () => {
        mode = "day";
        document.getElementById("rpt-mode-day").className =
            "rpt-mode-btn px-4 py-1.5 text-sm font-medium bg-orange-500 text-white";
        document.getElementById("rpt-mode-month").className =
            "rpt-mode-btn px-4 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50";
        document.getElementById("rpt-date").classList.remove("hidden");
        document.getElementById("rpt-month").classList.add("hidden");
        loadReport();
    });
    document.getElementById("rpt-mode-month").addEventListener("click", () => {
        mode = "month";
        document.getElementById("rpt-mode-month").className =
            "rpt-mode-btn px-4 py-1.5 text-sm font-medium bg-orange-500 text-white";
        document.getElementById("rpt-mode-day").className =
            "rpt-mode-btn px-4 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50";
        document.getElementById("rpt-date").classList.add("hidden");
        document.getElementById("rpt-month").classList.remove("hidden");
        loadReport();
    });

    document
        .getElementById("rpt-tab-fnb")
        .addEventListener("click", () => setTab("fnb"));
    document
        .getElementById("rpt-tab-rental")
        .addEventListener("click", () => setTab("rental"));

    document.getElementById("rpt-date").addEventListener("change", loadReport);
    document.getElementById("rpt-month").addEventListener("change", loadReport);

    loadReport();

    function renderFnbTable(rows) {
        const content = document.getElementById("rpt-content");
        if (!rows.length) {
            content.innerHTML = `<p class="text-center text-gray-400 py-12 text-sm">No F&amp;B transactions in this period</p>`;
            return;
        }
        const tbody = rows
            .map((row) => {
                const customer = row.member_name || row.guest_name || "Guest";
                return `<tr class="hover:bg-gray-50">
        <td class="table-td text-xs text-gray-400">#${row.id}</td>
        <td class="table-td font-medium">${customer}</td>
        <td class="table-td font-semibold text-orange-600">${idr(row.total_price)}</td>
        <td class="table-td text-xs text-gray-500">${fmtDate(row.created_at)}</td>
      </tr>`;
            })
            .join("");
        content.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr>
            <th class="table-th">ID</th>
            <th class="table-th">Customer</th>
            <th class="table-th">Total</th>
            <th class="table-th">Date</th>
          </tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
      <p class="text-xs text-gray-400 mt-2">${rows.length} record(s)</p>
    `;
    }

    function renderRentalTable(rows) {
        const content = document.getElementById("rpt-content");
        if (!rows.length) {
            content.innerHTML = `<p class="text-center text-gray-400 py-12 text-sm">No rental transactions in this period</p>`;
            return;
        }
        const tbody = rows
            .map((row) => {
                const customer = row.member_name || row.guest_name || "Guest";
                const statusBadge =
                    row.status === 2
                        ? `<span class="badge-red">Cancelled</span>`
                        : row.status === 0
                          ? `<span class="badge-orange">Renting</span>`
                          : `<span class="badge-green">Returned</span>`;
                return `<tr class="hover:bg-gray-50">
        <td class="table-td text-xs text-gray-400">#${row.id}</td>
        <td class="table-td">
          <div class="font-medium">${row.racket_name}</div>
          <div class="text-xs text-gray-400">${row.racket_model}</div>
        </td>
        <td class="table-td">${customer}</td>
        <td class="table-td text-xs">${fmtDate(row.start)} <span class="text-gray-400">(${row.duration}h)</span></td>
        <td class="table-td font-semibold text-orange-600">${idr(row.total_price)}</td>
        <td class="table-td">${statusBadge}</td>
      </tr>`;
            })
            .join("");
        content.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr>
            <th class="table-th">ID</th>
            <th class="table-th">Racket</th>
            <th class="table-th">Customer</th>
            <th class="table-th">Date / Duration</th>
            <th class="table-th">Total</th>
            <th class="table-th">Status</th>
          </tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
      <p class="text-xs text-gray-400 mt-2">${rows.length} record(s)</p>
    `;
    }
}
