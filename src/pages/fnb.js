import { idr, toast, fmtDateTime, now, debounce } from "../utils.js";
import { unwrap } from "../db.js";

const CATEG = { 1: "Beverages", 2: "Foods", 3: "Snacks" };
let cart = [];
let db_ref = null;

export async function renderFnb(container, db, role = "manager") {
  db_ref = db;
  cart = [];

  container.innerHTML = `
    <div class="flex gap-5 h-full" style="min-height: 75vh;">
      <!-- Product Panel -->
      <div class="flex-1 flex flex-col min-w-0 card p-0 overflow-hidden">
        <div class="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
          <input type="text" id="fnb-search" placeholder="Search product..." class="form-input max-w-xs"/>
      </div>
        <div id="fnb-products" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto p-4"></div>
      </div>

      <!-- Cart Panel -->
      <div class="w-80 flex-shrink-0 flex flex-col gap-3">
        <div class="card flex-1 flex flex-col" style="max-height: 65vh;">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-800">Cart</h3>
            <button id="clear-cart" class="text-xs text-red-500 hover:underline">Clear all</button>
          </div>

      

          <!-- Items -->
          <div id="cart-items" class="flex-1 overflow-y-auto space-y-2 min-h-0"></div>

              <!-- Customer -->
          <div class="mb-3">
            <label class="form-label">Customer</label>
            <div class="relative">
              <input type="text" id="customer-search" placeholder="Member name or guest..." class="form-input pr-16" autocomplete="off"/>
              <span id="customer-type" class="absolute right-2 top-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Guest</span>
            </div>
            <input type="hidden" id="customer-id"/>
            <div id="customer-dropdown" class="absolute z-20 bg-white dark:bg-[#2e2e32] border border-gray-200 dark:border-white/10 rounded-lg shadow-lg mt-1 w-64 hidden max-h-40 overflow-y-auto"></div>
          </div>

          <!-- Total -->
          <div class="border-t pt-3 mt-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600">Total</span>
              <span id="cart-total" class="font-bold text-lg text-orange-600">Rp 0</span>
            </div>
            <!-- Slide to confirm -->
            <div id="slide-container" class="slide-track">
              <div id="slide-thumb" class="slide-thumb select-none">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <span class="slide-text">Slide to Pay</span>
            </div>
          </div>
        </div>

        <!-- Recent Transactions -->
<div class="card overflow-hidden flex flex-col" style="max-height:28vh;">

    <div class="flex items-center justify-between mb-2">
        <h3 class="font-semibold text-gray-800 text-sm">
            Recent Sales
        </h3>

        <button
            id="recent-sales-details"
            class="text-xs text-orange-600 hover:underline">
            More Details
        </button>

    </div>

    <div
        id="recent-sales"
        class="overflow-y-auto flex-1 space-y-1">
    </div>

</div>           
         </div>
      </div>
    </div>
  <div id="sales-modal" class="modal-overlay hidden">

    <div class="modal-box max-w-3xl">

        <div class="modal-header">

            <h3 class="font-semibold">
                Today's Sales
            </h3>

            <button
                id="close-sales-modal"
                class="text-xl">
                ×
            </button>

        </div>

        <div
            id="sales-modal-body"
            class="p-5 max-h-[70vh] overflow-y-auto">

        </div>

    </div>

</div>`;

  initSlider(db);
  document.getElementById("clear-cart").addEventListener("click", () => {
    cart = [];
    renderCart();
  });

  const searchFn = debounce(() => loadProducts(db));
  document.getElementById("fnb-search").addEventListener("input", searchFn);

  // Customer autocomplete
  const cusSearch = document.getElementById("customer-search");
  const cusDrop = document.getElementById("customer-dropdown");

  async function showMemberDropdown(filter = "") {
    let query = db
      .from("members")
      .select("id, member_name")
      .eq("status", 0)
      .order("member_name")
      .limit(20);
    if (filter) query = query.ilike("member_name", `%${filter}%`);
    const members = unwrap(await query);
    if (!members.length) {
      cusDrop.classList.add("hidden");
      return;
    }
    cusDrop.innerHTML = members
      .map(
        (m) =>
          `<button class="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200" data-id="${m.id}" data-name="${m.member_name}">${m.member_name}</button>`,
      )
      .join("");
    cusDrop.classList.remove("hidden");
    cusDrop.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        cusSearch.value = btn.dataset.name;
        document.getElementById("customer-id").value = btn.dataset.id;
        document.getElementById("customer-type").textContent = "Member";
        document.getElementById("customer-type").className =
          "absolute right-2 top-2 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700";
        cusDrop.classList.add("hidden");
      }),
    );
  }

  cusSearch.addEventListener("focus", () =>
    showMemberDropdown(cusSearch.value.trim()),
  );
  cusSearch.addEventListener(
    "input",
    debounce(() => {
      const v = cusSearch.value.trim();
      if (!v) {
        document.getElementById("customer-id").value = "";
        document.getElementById("customer-type").textContent = "Guest";
        document.getElementById("customer-type").className =
          "absolute right-2 top-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600";
      }
      showMemberDropdown(v);
    }),
  );

  document.addEventListener("click", (e) => {
    if (!cusSearch.contains(e.target) && !cusDrop.contains(e.target))
      cusDrop.classList.add("hidden");
  });

  await loadProducts(db);
  await loadRecentSales(db);
  document
    .getElementById("recent-sales-details")
    .addEventListener("click", async () => {
      await loadSalesModal(db);

      document.getElementById("sales-modal").classList.remove("hidden");
    });

  document.getElementById("close-sales-modal").addEventListener("click", () => {
    document.getElementById("sales-modal").classList.add("hidden");
  });
}

async function loadProducts(db) {
  const search = document.getElementById("fnb-search")?.value?.trim() || "";
  let query = db.from("fnb_stock").select("*").gt("stock", 0);
  if (search) query = query.ilike("fnb_name", `%${search}%`);
  query = query.order("fnb_name");
  const products = unwrap(await query);

  const grid = document.getElementById("fnb-products");

  const grouped = {
    1: [],
    2: [],
    3: [],
  };

  products.forEach((p) => grouped[p.categ].push(p));

  function renderCard(p) {
    const imgHtml = p.fnb_image
      ? `<img src="${p.fnb_image}" class="w-full h-28 object-cover rounded-t-xl"/>`
      : `<div class="w-full h-28 bg-gradient-to-br from-orange-50 to-orange-100 rounded-t-xl flex items-center justify-center text-4xl">
            ${p.categ === 1 ? "🥤" : p.categ === 2 ? "🍱" : "🍿"}
        </div>`;

    return `
    <button class="card p-0 overflow-hidden text-left hover:shadow-md hover:border-orange-200 transition-all product-card"
        data-id="${p.id}"
        data-name="${p.fnb_name}"
        data-price="${p.price}"
        data-stock="${p.stock}">

        ${imgHtml}

        <div class="p-3">
            <p class="text-sm font-semibold">${p.fnb_name}</p>
            <p class="text-orange-600 font-bold">${idr(p.price)}</p>
            <p class="text-xs text-gray-400">Stock: ${p.stock}</p>
        </div>

    </button>
    `;
  }

  grid.innerHTML = [1, 2, 3]
    .map(
      (c) => `
<div class="col-span-full">

    <h2 class="text-lg font-bold mb-3 mt-2">
        ${CATEG[c]}
    </h2>

    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        ${grouped[c].map(renderCard).join("")}
    </div>

</div>
`,
    )
    .join("");

  document.querySelectorAll(".product-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      addToCart({
        id: btn.dataset.id,
        name: btn.dataset.name,
        price: parseInt(btn.dataset.price),
        maxStock: parseInt(btn.dataset.stock),
      });
    });
  });
}

function addToCart(product) {
  const existing = cart.find((i) => i.id === product.id);
  if (existing) {
    if (existing.qty >= product.maxStock) {
      toast(`Max stock: ${product.maxStock}`, "warning");
      return;
    }
    existing.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  renderCart();
}

function renderCart() {
  const container = document.getElementById("cart-items");
  if (!cart.length) {
    container.innerHTML = `<p class="text-center text-gray-400 text-sm py-8">Cart is empty</p>`;
    document.getElementById("cart-total").textContent = "Rp 0";
    return;
  }

  container.innerHTML = cart
    .map(
      (item, idx) => `
    <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-gray-800 truncate">${item.name}</p>
        <p class="text-xs text-orange-600">${idr(item.price)}</p>
      </div>
      <div class="flex items-center gap-1">
        <button class="w-6 h-6 rounded bg-white border text-gray-600 hover:bg-gray-100 text-xs font-bold" data-action="dec" data-idx="${idx}">-</button>
        <span class="w-6 text-center text-xs font-semibold">${item.qty}</span>
        <button class="w-6 h-6 rounded bg-white border text-gray-600 hover:bg-gray-100 text-xs font-bold" data-action="inc" data-idx="${idx}">+</button>
      </div>
      <span class="text-xs font-semibold text-gray-700 w-16 text-right">${idr(item.qty * item.price)}</span>
      <button class="text-red-400 hover:text-red-600" data-action="del" data-idx="${idx}">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  `,
    )
    .join("");

  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      if (btn.dataset.action === "inc") cart[idx].qty++;
      else if (btn.dataset.action === "dec") {
        cart[idx].qty--;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
      } else if (btn.dataset.action === "del") cart.splice(idx, 1);
      renderCart();
    });
  });

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
  document.getElementById("cart-total").textContent = idr(total);
}

function initSlider(db) {
  const track = document.getElementById("slide-container");
  const thumb = document.getElementById("slide-thumb");
  if (!track || !thumb) return;

  let dragging = false,
    startX = 0,
    thumbLeft = 0;

  thumb.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX - thumb.offsetLeft;
  });
  thumb.addEventListener(
    "touchstart",
    (e) => {
      dragging = true;
      startX = e.touches[0].clientX - thumb.offsetLeft;
    },
    { passive: true },
  );

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const max = track.clientWidth - thumb.clientWidth;
    thumbLeft = Math.max(0, Math.min(max, e.clientX - startX));
    thumb.style.left = thumbLeft + "px";
    if (thumbLeft >= max * 0.9) thumb.style.backgroundColor = "#16a34a";
    else thumb.style.backgroundColor = "";
  });

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!dragging) return;
      const max = track.clientWidth - thumb.clientWidth;
      thumbLeft = Math.max(0, Math.min(max, e.touches[0].clientX - startX));
      thumb.style.left = thumbLeft + "px";
      if (thumbLeft >= max * 0.9) thumb.style.backgroundColor = "#16a34a";
      else thumb.style.backgroundColor = "";
    },
    { passive: true },
  );

  document.addEventListener("mouseup", async () => {
    if (!dragging) return;
    dragging = false;
    const max = track.clientWidth - thumb.clientWidth;
    if (thumbLeft >= max * 0.9) {
      await processCheckout(db);
    }
    thumb.style.left = "0";
    thumb.style.backgroundColor = "";
    thumbLeft = 0;
  });

  document.addEventListener("touchend", async () => {
    if (!dragging) return;
    dragging = false;
    const max = track.clientWidth - thumb.clientWidth;
    if (thumbLeft >= max * 0.9) await processCheckout(db);
    thumb.style.left = "0";
    thumb.style.backgroundColor = "";
    thumbLeft = 0;
  });
}

async function processCheckout(db) {
  if (!cart.length) {
    toast("Cart is empty", "error");
    return;
  }

  const memberId = document.getElementById("customer-id").value || null;
  const guestName = document.getElementById("customer-search").value.trim();
  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);

  try {
    const log = unwrap(
      await db
        .from("fnb_log")
        .insert({
          id_member: memberId ? parseInt(memberId) : null,
          guest_name: memberId ? "" : guestName || "Guest",
          total_price: total,
        })
        .select("id")
        .single(),
    );
    const logId = log.id;

    for (const item of cart) {
      unwrap(
        await db.from("fnb_log_items").insert({
          log_id: logId,
          fnb_id: parseInt(item.id),
          fnb_name: item.name,
          qty: item.qty,
          price: item.price,
        }),
      );
      const prod = unwrap(
        await db
          .from("fnb_stock")
          .select("stock, safety_stock")
          .eq("id", item.id)
          .single(),
      );
      const prev = prod.stock;
      const newStock = prev - item.qty;
      unwrap(
        await db
          .from("fnb_stock")
          .update({ stock: newStock })
          .eq("id", item.id),
      );
      unwrap(
        await db.from("fnb_stock_history").insert({
          product_id: parseInt(item.id),
          prev_stock: prev,
          new_stock: newStock,
          diff: -item.qty,
          changed_by: "cashier",
          description: `Sale #${logId}`,
        }),
      );
    }

    toast(`Payment confirmed! ${idr(total)}`);
    cart = [];
    renderCart();
    document.getElementById("customer-search").value = "";
    document.getElementById("customer-id").value = "";
    document.getElementById("customer-type").textContent = "Guest";
    document.getElementById("customer-type").className =
      "absolute right-2 top-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600";
    await loadProducts(db);
    await loadRecentSales(db);
  } catch (err) {
    toast("Checkout failed: " + err.message, "error");
  }
}

async function loadRecentSales(db) {
  const rows = unwrap(await db.rpc("get_recent_sales"));
  document.getElementById("recent-sales").innerHTML = rows.length
    ? rows
        .map(
          (r) => `
        <div class="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
          <div>
            <p class="text-xs font-medium text-gray-700">${r.member_name || r.guest_name || "Guest"}</p>
            <p class="text-xs text-gray-400">${fmtDateTime(r.created_at)}</p>
          </div>
          <span class="text-xs font-semibold text-orange-600">${idr(r.total_price)}</span>
        </div>
      `,
        )
        .join("")
    : '<p class="text-xs text-gray-400 text-center py-4">No recent sales</p>';
}
async function loadSalesModal(db) {
  const rows = unwrap(await db.rpc("get_today_sales"));

  const body = document.getElementById("sales-modal-body");

  body.innerHTML = rows
    .map(
      (r) => `

<div class="border rounded-lg p-3 mb-2">

    <div class="flex justify-between">

        <div>

            <div class="font-semibold">
                ${r.member_name || r.guest_name || "Guest"}
            </div>

            <div class="text-xs text-gray-500">
                ${fmtDateTime(r.created_at)}
            </div>

        </div>

        <div class="font-bold text-orange-600">
            ${idr(r.total_price)}
        </div>

    </div>

</div>

`,
    )
    .join("");
}
