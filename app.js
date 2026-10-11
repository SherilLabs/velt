/* VAULT — local-first savings tracker */
(() => {
  "use strict";

  const STORAGE_KEY = "vaultSavingsTracker.v1";
  const INCOME_CATEGORIES = ["Uang bulanan", "Gaji / freelance", "Hadiah", "Penjualan", "Beasiswa", "Lainnya"];
  const EXPENSE_CATEGORIES = ["Makanan", "Transportasi", "Kuliah", "Kebutuhan pribadi", "Nongkrong", "Belanja", "Tagihan", "Kesehatan", "Hiburan", "Lainnya"];
  const CATEGORY_COLORS = ["#b6adff", "#82d6ae", "#f29cab", "#8fc9f5", "#e8c78b", "#d5a7f0", "#7fc8c5", "#f0a77e", "#9ba7ff", "#c1c4d4"];
  const GOAL_ICONS = { laptop: "laptop", shield: "shield-check", "graduation-cap": "graduation-cap", heart: "heart", plane: "plane", gem: "gem" };
  const $ = (id) => document.getElementById(id);
  let state = loadState();
  let flowChart = null, categoryChart = null, balanceChart = null, insightCategoryChart = null;
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedDate = dateKey(new Date());
  let toastTimer;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { transactions: [], goals: [] };
      const parsed = JSON.parse(raw);
      return { transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [], goals: Array.isArray(parsed.goals) ? parsed.goals : [] };
    } catch (error) {
      console.warn("VAULT data could not be loaded:", error);
      return { transactions: [], goals: [] };
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      showToast("Gagal menyimpan. Periksa ruang penyimpanan browser.");
      return false;
    }
  }
  function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
  function dateKey(date) {
    const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function parseDate(key) { const [y, m, d] = String(key).split("-").map(Number); return new Date(y, m - 1, d); }
  function formatDate(key, options = { day: "numeric", month: "short", year: "numeric" }) {
    if (!key) return "—";
    return parseDate(key).toLocaleDateString("id-ID", options);
  }
  function rupiah(value) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
  }
  function numberCompact(value) {
    const n = Math.abs(Number(value) || 0);
    if (n >= 1000000) return `Rp${(n / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    if (n >= 1000) return `Rp${(n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
    return rupiah(n);
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function allTimeTotals() {
    return state.transactions.reduce((acc, tx) => {
      if (tx.type === "income") acc.income += Number(tx.amount) || 0;
      else acc.expense += Number(tx.amount) || 0;
      return acc;
    }, { income: 0, expense: 0 });
  }
  function monthTransactions(monthDate = new Date()) {
    const month = monthDate.getMonth(), year = monthDate.getFullYear();
    return state.transactions.filter(tx => { const d = parseDate(tx.date); return d.getMonth() === month && d.getFullYear() === year; });
  }
  function sumByType(transactions, type) { return transactions.filter(tx => tx.type === type).reduce((sum, tx) => sum + Number(tx.amount || 0), 0); }
  function categoryTotals(transactions, type = "expense") {
    const totals = {};
    transactions.filter(tx => tx.type === type).forEach(tx => { totals[tx.category] = (totals[tx.category] || 0) + Number(tx.amount || 0); });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }
  function icon(name) { return `<i data-lucide="${escapeHtml(name)}"></i>`; }
  function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
  function showToast(message) {
    const toast = $("toast"); toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  const PAGE_TITLES = { overview: "Overview", transactions: "Transactions", goals: "Saving goals", calendar: "Calendar", insights: "Insights", backup: "Data & backup" };
  function navigate(page) {
    if (!PAGE_TITLES[page]) return;
    document.querySelectorAll(".page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
    document.querySelectorAll(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.page === page));
    $("breadcrumbTitle").textContent = PAGE_TITLES[page];
    $("sidebar").classList.remove("open");
    if (page === "transactions") renderTransactions();
    if (page === "goals") renderGoals();
    if (page === "calendar") renderCalendar();
    if (page === "insights") renderInsights();
    if (page === "backup") refreshIcons();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll("[data-page]").forEach(el => el.addEventListener("click", () => navigate(el.dataset.page)));
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 900 && $("sidebar").classList.contains("open") && !$("sidebar").contains(event.target) && !$("menuToggle").contains(event.target)) $("sidebar").classList.remove("open");
  });
  $("todayLabel").textContent = new Date().toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  $("settingsShortcut").addEventListener("click", () => navigate("backup"));
  $("topBackup").addEventListener("click", () => navigate("backup"));

  function openModal(id) { $(id).classList.remove("hidden"); document.body.style.overflow = "hidden"; refreshIcons(); }
  function closeModal(id) { $(id).classList.add("hidden"); document.body.style.overflow = ""; }
  document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => closeModal(el.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", e => { if (e.target === backdrop) closeModal(backdrop.id); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".modal-backdrop:not(.hidden)").forEach(el => closeModal(el.id)); });

  function setTransactionCategories(selected = "") {
    const type = document.querySelector('input[name="transactionType"]:checked').value;
    const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    $("transactionCategory").innerHTML = categories.map(c => `<option ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
  }
  function openTransactionModal(id = "") {
    $("transactionForm").reset();
    $("transactionId").value = "";
    $("transactionDate").value = dateKey(new Date());
    $("transactionMethod").value = "Tunai";
    document.querySelector('input[name="transactionType"][value="income"]').checked = true;
    setTransactionCategories();
    $("transactionModalTitle").textContent = "Add transaction";
    if (id) {
      const tx = state.transactions.find(item => item.id === id);
      if (!tx) return;
      $("transactionModalTitle").textContent = "Edit transaction";
      $("transactionId").value = tx.id;
      $("transactionName").value = tx.name;
      $("transactionAmount").value = tx.amount;
      $("transactionDate").value = tx.date;
      $("transactionNotes").value = tx.notes || "";
      $("transactionMethod").value = tx.method || "Tunai";
      document.querySelector(`input[name="transactionType"][value="${tx.type}"]`).checked = true;
      setTransactionCategories(tx.category);
    }
    openModal("transactionModal");
    setTimeout(() => $("transactionName").focus(), 50);
  }
  $("addTransactionBtn").addEventListener("click", () => openTransactionModal());
  $("addTransactionBtn2").addEventListener("click", () => openTransactionModal());
  $("quickAdd").addEventListener("click", () => openTransactionModal());
  $("calendarAdd").addEventListener("click", () => openTransactionModal());
  document.querySelectorAll('input[name="transactionType"]').forEach(el => el.addEventListener("change", () => setTransactionCategories()));
  $("transactionForm").addEventListener("submit", event => {
    event.preventDefault();
    const id = $("transactionId").value;
    const tx = {
      id: id || uid(),
      name: $("transactionName").value.trim(),
      type: document.querySelector('input[name="transactionType"]:checked').value,
      amount: Math.round(Number($("transactionAmount").value)),
      date: $("transactionDate").value,
      category: $("transactionCategory").value,
      method: $("transactionMethod").value,
      notes: $("transactionNotes").value.trim()
    };
    if (!tx.name || !Number.isFinite(tx.amount) || tx.amount <= 0 || !tx.date) return showToast("Periksa nama, nominal, dan tanggal transaksi.");
    if (id) state.transactions = state.transactions.map(item => item.id === id ? tx : item);
    else state.transactions.push(tx);
    saveState(); closeModal("transactionModal"); renderAll();
    showToast(id ? "Transaksi berhasil diperbarui." : "Transaksi berhasil ditambahkan.");
  });

  function transactionSymbol(tx) {
    const name = tx.type === "income" ? "arrow-down-left" : "arrow-up-right";
    return `<span class="transaction-symbol">${icon(name)}</span>`;
  }
  function transactionRow(tx, includeActions = false) {
    return `<tr>
      <td><div class="transaction-name">${transactionSymbol(tx)}<div><strong>${escapeHtml(tx.name)}</strong><small>${escapeHtml(tx.method || "Tunai")}</small></div></div></td>
      <td>${formatDate(tx.date)}</td>
      ${includeActions ? `<td><span class="category-pill">${tx.type === "income" ? "Pemasukan" : "Pengeluaran"}</span></td>` : ""}
      <td><span class="category-pill">${escapeHtml(tx.category)}</span></td>
      ${includeActions ? `<td title="${escapeHtml(tx.notes || "")}">${escapeHtml(tx.notes || "—")}</td>` : ""}
      <td class="align-right ${tx.type === "income" ? "amount-income" : "amount-expense"}">${tx.type === "income" ? "+" : "−"}${rupiah(tx.amount)}</td>
      ${includeActions ? `<td><div class="row-actions"><button data-edit-tx="${escapeHtml(tx.id)}" aria-label="Edit transaction" title="Edit">${icon("pencil")}</button><button data-delete-tx="${escapeHtml(tx.id)}" aria-label="Delete transaction" title="Hapus">${icon("trash-2")}</button></div></td>` : ""}
    </tr>`;
  }
  function bindTransactionActions(container) {
    container.querySelectorAll("[data-edit-tx]").forEach(btn => btn.addEventListener("click", () => openTransactionModal(btn.dataset.editTx)));
    container.querySelectorAll("[data-delete-tx]").forEach(btn => btn.addEventListener("click", () => {
      const tx = state.transactions.find(item => item.id === btn.dataset.deleteTx);
      if (tx && confirm(`Hapus transaksi "${tx.name}"?`)) {
        state.transactions = state.transactions.filter(item => item.id !== tx.id);
        saveState(); renderAll(); showToast("Transaksi dihapus.");
      }
    }));
  }
  function renderRecentTransactions() {
    const sorted = [...state.transactions].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5);
    $("recentTransactions").innerHTML = sorted.map(tx => transactionRow(tx)).join("");
    $("recentEmpty").classList.toggle("hidden", sorted.length > 0);
  }
  function renderTransactions() {
    const query = $("transactionSearch").value.trim().toLowerCase();
    const type = $("typeFilter").value, category = $("categoryFilter").value;
    const filtered = [...state.transactions].filter(tx => {
      const text = `${tx.name} ${tx.category} ${tx.notes || ""} ${tx.method || ""}`.toLowerCase();
      return (!query || text.includes(query)) && (type === "all" || tx.type === type) && (category === "all" || tx.category === category);
    }).sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    $("allTransactions").innerHTML = filtered.map(tx => transactionRow(tx, true)).join("");
    $("transactionsEmpty").classList.toggle("hidden", filtered.length > 0);
    $("transactionCount").textContent = `${filtered.length} dari ${state.transactions.length} transaksi`;
    bindTransactionActions($("allTransactions")); refreshIcons();
  }
  function refreshCategoryFilter() {
    const select = $("categoryFilter"), current = select.value;
    const categories = [...new Set(state.transactions.map(tx => tx.category))].sort();
    select.innerHTML = `<option value="all">Semua kategori</option>` + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (categories.includes(current)) select.value = current;
  }
  ["transactionSearch", "typeFilter", "categoryFilter"].forEach(id => $(id).addEventListener(id === "transactionSearch" ? "input" : "change", renderTransactions));
  $("clearFilters").addEventListener("click", () => { $("transactionSearch").value = ""; $("typeFilter").value = "all"; $("categoryFilter").value = "all"; renderTransactions(); });
  $("exportCsvBtn").addEventListener("click", exportCsv);

  function goalProgress(goal) { return Math.min(100, Math.max(0, (Number(goal.saved) / Math.max(1, Number(goal.target))) * 100)); }
  function goalRemaining(goal) { return Math.max(0, Number(goal.target) - Number(goal.saved)); }
  function goalMarkup(goal, compact = false) {
    const percent = goalProgress(goal), iconName = GOAL_ICONS[goal.icon] || "target";
    return `<div class="goal-item">
      <div class="goal-item-top"><span class="goal-icon">${icon(iconName)}</span><div class="goal-title-wrap"><strong>${escapeHtml(goal.name)}</strong><small>${goal.deadline ? `Target ${formatDate(goal.deadline, {day:"numeric",month:"short",year:"numeric"})}` : "No deadline set"}</small></div><span class="goal-percent">${Math.round(percent)}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
      <div class="goal-amount-row"><span><strong>${rupiah(goal.saved)}</strong> saved</span><span>${rupiah(goal.target)}</span></div>
    </div>`;
  }
  function openGoalModal(id = "") {
    $("goalForm").reset(); $("goalId").value = ""; $("goalSaved").value = 0; $("goalDeadline").value = "";
    $("goalModalTitle").textContent = "Create saving goal";
    if (id) {
      const goal = state.goals.find(g => g.id === id); if (!goal) return;
      $("goalModalTitle").textContent = "Edit saving goal";
      $("goalId").value = goal.id; $("goalName").value = goal.name; $("goalTarget").value = goal.target;
      $("goalSaved").value = goal.saved; $("goalDeadline").value = goal.deadline || "";
      $("goalIcon").value = goal.icon || "gem"; $("goalNote").value = goal.note || "";
    }
    openModal("goalModal"); setTimeout(() => $("goalName").focus(), 50);
  }
  $("addGoalBtn").addEventListener("click", () => openGoalModal());
  $("emptyAddGoal").addEventListener("click", () => openGoalModal());
  $("goalForm").addEventListener("submit", event => {
    event.preventDefault();
    const id = $("goalId").value;
    const goal = { id: id || uid(), name: $("goalName").value.trim(), target: Math.round(Number($("goalTarget").value)), saved: Math.round(Number($("goalSaved").value)), deadline: $("goalDeadline").value, icon: $("goalIcon").value, note: $("goalNote").value.trim() };
    if (!goal.name || goal.target <= 0 || goal.saved < 0 || !Number.isFinite(goal.target) || !Number.isFinite(goal.saved)) return showToast("Periksa nama dan nominal target.");
    if (id) state.goals = state.goals.map(g => g.id === id ? goal : g); else state.goals.push(goal);
    saveState(); closeModal("goalModal"); renderAll(); showToast(id ? "Target diperbarui." : "Target tabungan dibuat.");
  });
  function renderGoals() {
    const totalTarget = state.goals.reduce((s,g) => s + Number(g.target), 0);
    const totalSaved = state.goals.reduce((s,g) => s + Number(g.saved), 0);
    const overall = totalTarget ? Math.min(100, totalSaved / totalTarget * 100) : 0;
    $("goalSummary").innerHTML = [
      ["Total target", rupiah(totalTarget)], ["Terkumpul", rupiah(totalSaved)], ["Overall progress", `${Math.round(overall)}%`]
    ].map(([label,value]) => `<div class="goal-summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
    $("allGoals").innerHTML = state.goals.map(goal => {
      const percent = goalProgress(goal);
      return `<article class="goal-card">
        <div class="goal-card-top"><span class="goal-icon">${icon(GOAL_ICONS[goal.icon] || "target")}</span><div><h3>${escapeHtml(goal.name)}</h3><p>${goal.deadline ? `Deadline ${formatDate(goal.deadline)}` : "No deadline set"}</p></div><div class="row-actions"><button data-edit-goal="${escapeHtml(goal.id)}" aria-label="Edit goal">${icon("pencil")}</button><button data-delete-goal="${escapeHtml(goal.id)}" aria-label="Delete goal">${icon("trash-2")}</button></div></div>
        <div class="goal-big-progress"><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><div class="goal-amount-row"><span><strong>${rupiah(goal.saved)}</strong> terkumpul</span><span>${Math.round(percent)}%</span></div></div>
        <div class="goal-amount-row"><span>Target</span><strong>${rupiah(goal.target)}</strong></div>
        <div class="goal-amount-row"><span>Sisa target</span><strong>${rupiah(goalRemaining(goal))}</strong></div>
        ${goal.note ? `<p class="goal-card-note">${escapeHtml(goal.note)}</p>` : ""}
        <div class="goal-card-footer"><span>${goalRemaining(goal) === 0 ? "Target tercapai 🎉" : "Keep going, you're doing great."}</span><strong>${goalRemaining(goal) === 0 ? "100%" : `${rupiah(goalRemaining(goal))} left`}</strong></div>
      </article>`;
    }).join("");
    $("goalsEmpty").classList.toggle("hidden", state.goals.length > 0);
    $("allGoals").classList.toggle("hidden", state.goals.length === 0);
    $("goalSummary").classList.toggle("hidden", state.goals.length === 0);
    $("overviewGoals").innerHTML = state.goals.slice(0, 3).map(g => goalMarkup(g, true)).join("");
    if (!state.goals.length) $("overviewGoals").innerHTML = `<div class="empty-state"><i data-lucide="target"></i><strong>Start with one goal</strong><p>Buat target tabungan pertamamu.</p></div>`;
    $("allGoals").querySelectorAll("[data-edit-goal]").forEach(btn => btn.addEventListener("click", () => openGoalModal(btn.dataset.editGoal)));
    $("allGoals").querySelectorAll("[data-delete-goal]").forEach(btn => btn.addEventListener("click", () => {
      const goal = state.goals.find(g => g.id === btn.dataset.deleteGoal);
      if (goal && confirm(`Hapus target "${goal.name}"?`)) { state.goals = state.goals.filter(g => g.id !== goal.id); saveState(); renderAll(); showToast("Target dihapus."); }
    }));
    refreshIcons();
  }

  function destroyChart(chart) { if (chart) chart.destroy(); }
  function chartDefaults() {
    return { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" }, plugins: {
      legend: { display: false }, tooltip: { backgroundColor: "#242536", borderColor: "#45445f", borderWidth: 1, titleColor: "#f4f2ff", bodyColor: "#c7c6d8", padding: 11, callbacks: { label: context => `${context.dataset.label}: ${rupiah(context.parsed.y ?? context.parsed)}` } }
    }, scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: "#83879c", font: { family: "DM Sans", size: 10 }, maxRotation: 0 } },
      y: { beginAtZero: true, border: { display: false, dash: [3, 4] }, grid: { color: "#2a2d3b" }, ticks: { color: "#83879c", font: { family: "DM Sans", size: 10 }, callback: value => numberCompact(value), maxTicksLimit: 5 } }
    } };
  }
  function monthSeries(count) {
    const now = new Date();
    return Array.from({length: count}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - count + 1 + i, 1);
      const txs = state.transactions.filter(tx => { const td = parseDate(tx.date); return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear(); });
      return { key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: d.toLocaleDateString("id-ID", {month:"short"}), income: sumByType(txs, "income"), expense: sumByType(txs, "expense"), net: sumByType(txs, "income") - sumByType(txs, "expense") };
    });
  }
  function renderCharts() {
    if (!window.Chart) return;
    const series = monthSeries(Number($("flowPeriod").value) || 6);
    destroyChart(flowChart);
    flowChart = new Chart($("flowChart"), { type: "bar", data: { labels: series.map(s => s.label), datasets: [
      { label: "Income", data: series.map(s => s.income), backgroundColor: "#82d6ae", borderRadius: 5, maxBarThickness: 18 },
      { label: "Expenses", data: series.map(s => s.expense), backgroundColor: "#f29cab", borderRadius: 5, maxBarThickness: 18 }
    ] }, options: { ...chartDefaults(), scales: { ...chartDefaults().scales, x: { ...chartDefaults().scales.x, stacked: false } } } });

    const monthTxs = monthTransactions();
    const cats = categoryTotals(monthTxs);
    destroyChart(categoryChart);
    categoryChart = new Chart($("categoryChart"), { type: "doughnut", data: { labels: cats.map(c => c[0]), datasets: [{ data: cats.map(c => c[1]), backgroundColor: cats.map((_,i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]), borderColor: "#171923", borderWidth: 4, hoverOffset: 5 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "75%", plugins: { legend: { display: false }, tooltip: { backgroundColor: "#242536", callbacks: { label: c => `${c.label}: ${rupiah(c.parsed)}` } } } } });
    $("categoryChartCenter").innerHTML = `<strong>${numberCompact(sumByType(monthTxs, "expense"))}</strong><span>spent this month</span>`;
    $("categoryLegend").innerHTML = cats.slice(0,5).map((c,i) => `<div class="category-legend-row"><i class="legend-dot" style="background:${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}"></i><span>${escapeHtml(c[0])}</span><span class="category-amount">${numberCompact(c[1])}</span></div>`).join("");
    if (!cats.length) $("categoryLegend").innerHTML = `<div class="foot-muted" style="font-size:11px">Belum ada pengeluaran bulan ini.</div>`;
  }
  $("flowPeriod").addEventListener("change", renderCharts);

  function renderOverview() {
    const totals = allTimeTotals(), thisMonth = monthTransactions();
    $("totalBalance").textContent = rupiah(totals.income - totals.expense);
    $("totalIncome").textContent = rupiah(sumByType(thisMonth, "income"));
    $("totalExpense").textContent = rupiah(sumByType(thisMonth, "expense"));
    $("monthlySaved").textContent = rupiah(sumByType(thisMonth, "income") - sumByType(thisMonth, "expense"));
    $("incomePeriod").textContent = `${thisMonth.filter(t => t.type === "income").length} transaksi bulan ini`;
    $("expensePeriod").textContent = `${thisMonth.filter(t => t.type === "expense").length} transaksi bulan ini`;
    renderRecentTransactions(); renderCharts(); renderGoals(); refreshIcons();
  }

  function renderCalendar() {
    const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth();
    $("calendarMonth").textContent = calendarCursor.toLocaleDateString("id-ID", {month:"long",year:"numeric"});
    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset);
    const cells = [];
    for (let i=0; i<42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i), key = dateKey(d);
      const txs = state.transactions.filter(tx => tx.date === key);
      const income = sumByType(txs, "income"), expense = sumByType(txs, "expense");
      cells.push(`<button class="calendar-day ${d.getMonth() !== month ? "outside" : ""} ${key === selectedDate ? "selected" : ""} ${key === dateKey(new Date()) ? "today" : ""}" data-calendar-date="${key}" aria-label="${formatDate(key)}">
        <span class="day-number">${d.getDate()}</span><span class="day-markers">${income ? '<i class="income-dot"></i>' : ""}${expense ? '<i class="expense-dot"></i>' : ""}</span>
        ${txs.length ? `<span class="day-total">${numberCompact(income + expense)}</span>` : ""}
      </button>`);
    }
    $("calendarGrid").innerHTML = cells.join("");
    $("calendarGrid").querySelectorAll("[data-calendar-date]").forEach(btn => btn.addEventListener("click", () => { selectedDate = btn.dataset.calendarDate; if (parseDate(selectedDate).getMonth() !== calendarCursor.getMonth()) calendarCursor = new Date(parseDate(selectedDate).getFullYear(), parseDate(selectedDate).getMonth(), 1); renderCalendar(); }));
    const dayTxs = state.transactions.filter(tx => tx.date === selectedDate).sort((a,b) => a.type.localeCompare(b.type));
    $("selectedDayTitle").textContent = formatDate(selectedDate, {weekday:"long",day:"numeric",month:"long",year:"numeric"});
    const income = sumByType(dayTxs, "income"), expense = sumByType(dayTxs, "expense");
    $("selectedDaySummary").textContent = `${dayTxs.length} transaksi · pemasukan ${rupiah(income)} · pengeluaran ${rupiah(expense)}`;
    $("selectedDayTransactions").innerHTML = dayTxs.length ? dayTxs.map(tx => `<div class="day-transaction">${transactionSymbol(tx)}<div class="transaction-name"><div><strong>${escapeHtml(tx.name)}</strong><small>${escapeHtml(tx.category)} · ${escapeHtml(tx.method || "Tunai")}</small></div></div><strong class="${tx.type === "income" ? "amount-income" : "amount-expense"}">${tx.type === "income" ? "+" : "−"}${rupiah(tx.amount)}</strong></div>`).join("") : `<div class="empty-state"><i data-lucide="calendar-clock"></i><strong>No transactions on this date</strong><p>Belum ada aktivitas keuangan yang dicatat pada tanggal ini.</p></div>`;
    refreshIcons();
  }
  $("prevMonth").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth()-1, 1); renderCalendar(); });
  $("nextMonth").addEventListener("click", () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth()+1, 1); renderCalendar(); });
  $("calendarToday").addEventListener("click", () => { calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selectedDate = dateKey(new Date()); renderCalendar(); });

  function renderInsights() {
    const totals = allTimeTotals(), thisMonth = monthTransactions(), last = monthTransactions(new Date(new Date().getFullYear(), new Date().getMonth()-1, 1));
    const saved = sumByType(thisMonth, "income") - sumByType(thisMonth, "expense");
    const saveRate = sumByType(thisMonth, "income") ? Math.round(saved / sumByType(thisMonth, "income") * 100) : 0;
    $("insightStats").innerHTML = [
      ["All-time net balance", rupiah(totals.income-totals.expense)], ["This month's net", rupiah(saved)], ["Savings rate", `${saveRate}%`], ["Transactions recorded", String(state.transactions.length)]
    ].map(([label,value]) => `<article class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon lavender">${icon("chart-no-axes-combined")}</span></div><div class="stat-value">${value}</div><div class="stat-foot"><span class="foot-muted">Berdasarkan catatan VAULT</span></div></article>`).join("");
    const series = monthSeries(6);
    destroyChart(balanceChart);
    balanceChart = new Chart($("balanceChart"), { type: "line", data: { labels: series.map(s => s.label), datasets: [{ label: "Net balance", data: series.map(s => s.net), borderColor: "#b6adff", backgroundColor: "#b6adff20", fill: true, tension: .35, pointBackgroundColor: "#c7c0ff", pointRadius: 3 }] }, options: chartDefaults() });
    const cats = categoryTotals(state.transactions);
    destroyChart(insightCategoryChart);
    insightCategoryChart = new Chart($("insightCategoryChart"), { type: "bar", data: { labels: cats.slice(0,7).map(c=>c[0]), datasets: [{ label:"Expenses", data:cats.slice(0,7).map(c=>c[1]), backgroundColor:cats.slice(0,7).map((_,i)=>CATEGORY_COLORS[i%CATEGORY_COLORS.length]), borderRadius:5, maxBarThickness:25 }] }, options: { ...chartDefaults(), indexAxis:"y", plugins:{...chartDefaults().plugins, tooltip:{backgroundColor:"#242536",callbacks:{label:c=>rupiah(c.parsed.x)}}}, scales:{x:{...chartDefaults().scales.y,ticks:{color:"#83879c",callback:v=>numberCompact(v)},grid:{color:"#2a2d3b"}},y:{...chartDefaults().scales.x}} } });
    const lastNet = sumByType(last,"income") - sumByType(last,"expense");
    const expenseChange = sumByType(last,"expense") ? Math.round((sumByType(thisMonth,"expense") - sumByType(last,"expense")) / sumByType(last,"expense") * 100) : null;
    let message = state.transactions.length === 0 ? "Mulai dengan mencatat transaksi pertamamu. Insight akan muncul seiring data yang kamu kumpulkan." :
      saved > 0 ? `Bulan ini saldo bersihmu bertambah ${rupiah(saved)}. Pertahankan kebiasaan mencatat agar kamu bisa melihat pola dengan lebih jelas.` :
      saved < 0 ? `Pengeluaran bulan ini lebih besar daripada pemasukan sebesar ${rupiah(Math.abs(saved))}. Coba tinjau kembali kategorinya dan sesuaikan dengan kebutuhanmu.` :
      "Pemasukan dan pengeluaran bulan ini seimbang. Catat transaksi secara konsisten untuk mendapatkan gambaran yang lebih lengkap.";
    $("monthlyRecap").innerHTML = `<div class="recap-item"><span>Income this month</span><strong>${rupiah(sumByType(thisMonth,"income"))}</strong></div><div class="recap-item"><span>Expenses this month</span><strong>${rupiah(sumByType(thisMonth,"expense"))}</strong></div><div class="recap-item"><span>Last month's net</span><strong>${rupiah(lastNet)}</strong></div><div class="recap-message">${message}${expenseChange !== null ? ` Pengeluaran dibanding bulan lalu: ${expenseChange > 0 ? "naik" : expenseChange < 0 ? "turun" : "tetap"} ${Math.abs(expenseChange)}%.` : ""}</div>`;
    refreshIcons();
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function exportJson() {
    const payload = { app: "VAULT", version: 1, exportedAt: new Date().toISOString(), transactions: state.transactions, goals: state.goals };
    downloadBlob(JSON.stringify(payload, null, 2), `vault-backup-${dateKey(new Date())}.json`, "application/json");
    showToast("Backup JSON berhasil diunduh.");
  }
  function exportCsv() {
    const rows = [["Tanggal","Nama","Tipe","Kategori","Nominal","Metode","Catatan"], ...[...state.transactions].sort((a,b)=>a.date.localeCompare(b.date)).map(tx => [tx.date,tx.name,tx.type === "income" ? "Pemasukan" : "Pengeluaran",tx.category,tx.amount,tx.method || "",tx.notes || ""])];
    const csv = rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    downloadBlob("\uFEFF"+csv, `vault-transactions-${dateKey(new Date())}.csv`, "text/csv;charset=utf-8");
    showToast("File CSV berhasil diunduh.");
  }
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("importJsonInput").addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.goals)) throw new Error("Format file tidak sesuai.");
      const validTransactions = parsed.transactions.every(tx => tx && typeof tx.id === "string" && typeof tx.name === "string" && ["income","expense"].includes(tx.type) && Number.isFinite(Number(tx.amount)) && Number(tx.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(tx.date) && typeof tx.category === "string");
      const validGoals = parsed.goals.every(g => g && typeof g.id === "string" && typeof g.name === "string" && Number(g.target) > 0 && Number(g.saved) >= 0);
      if (!validTransactions || !validGoals) throw new Error("Ada data yang tidak valid dalam file.");
      if (!confirm(`Impor ${parsed.transactions.length} transaksi dan ${parsed.goals.length} target? Data VAULT saat ini akan diganti.`)) { event.target.value = ""; return; }
      state = { transactions: parsed.transactions, goals: parsed.goals };
      saveState(); renderAll(); showToast("Backup berhasil dipulihkan.");
    } catch (error) { showToast(`Gagal impor: ${error.message || "file tidak valid"}`); }
    event.target.value = "";
  });
  $("resetDataBtn").addEventListener("click", () => {
    if (!confirm("Yakin menghapus SEMUA transaksi dan target dari browser ini? Pastikan kamu sudah punya backup.")) return;
    state = { transactions: [], goals: [] }; saveState(); renderAll(); showToast("Semua data VAULT sudah direset.");
  });

  function renderAll() {
    refreshCategoryFilter(); renderOverview(); renderTransactions(); renderGoals(); renderCalendar();
    if ($("page-insights").classList.contains("active")) renderInsights();
  }
  renderAll();
  refreshIcons();
})();