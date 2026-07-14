/* =========================================================
   Daily Expense Tracker — application logic (jQuery)
   Features:
   1. Add expense with validation (empty form blocked)
   2. Filter by year + "Found no expenses." empty state
   3. Monthly totals diagram (custom-built, no chart library)
   Extras:
   - localStorage persistence
   - Edit / delete expenses
   - Rule-based auto-categorization tags
   - AI receipt scanning  (via serverless proxy)
   - AI yearly insights   (via serverless proxy)
   ========================================================= */

"use strict";

/* ---------- Constants ---------- */

var STORAGE_KEY = "expenses.v1";
var SEED_KEY = "expenses.seeded";
var AI_ENDPOINT = "/api/ai"; // same-origin serverless function (Vercel)

var MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var MONTHS_LONG = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"];

/* Simple keyword rules for auto-categorization (works offline, no AI needed) */
var CATEGORY_RULES = [
  { name: "Food & Drinks", keywords: ["nasi","lunch","dinner","breakfast","coffee","cafe","restaurant","food","mamak","kfc","mcd","pizza","grabfood","foodpanda"] },
  { name: "Transport",     keywords: ["petrol","fuel","grab","toll","parking","train","bus","lrt","mrt","car service","tyre","touch n go","tng"] },
  { name: "Bills & Utilities", keywords: ["insurance","bill","electric","water","wifi","internet","phone","astro","unifi","rent","loan"] },
  { name: "Shopping",      keywords: ["tv","desk","shirt","shoes","shopee","lazada","clothes","bag","furniture","ikea"] },
  { name: "Health & Fitness", keywords: ["gym","protein","clinic","pharmacy","vitamin","supplement","doctor"] },
  { name: "Entertainment", keywords: ["movie","cinema","game","steam","netflix","spotify","concert"] }
];

/* ---------- State ---------- */

var expenses = [];        // [{id, title, amount, date}]
var selectedYear = null;  // number
var editingId = null;     // id of expense being edited, or null
var aiAvailable = null;   // null = unknown, true/false after first attempt

/* ---------- Storage ---------- */

function loadExpenses() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    expenses = raw ? JSON.parse(raw) : [];
  } catch (e) {
    expenses = [];
  }

  // First run: seed with the sample data from the assignment screenshots
  if (expenses.length === 0 && !localStorage.getItem(SEED_KEY)) {
    expenses = [
      { id: uid(), title: "New TV",           amount: 799.49, date: "2021-03-12" },
      { id: uid(), title: "Car Insurance",    amount: 294.67, date: "2021-03-28" },
      { id: uid(), title: "New Desk (Wooden)", amount: 450,   date: "2021-06-12" }
    ];
    localStorage.setItem(SEED_KEY, "1");
    saveExpenses();
  }
}

function saveExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Helpers ---------- */

function formatRM(n) {
  return "RM" + Number(n).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function categorize(title) {
  var t = title.toLowerCase();
  for (var i = 0; i < CATEGORY_RULES.length; i++) {
    var rule = CATEGORY_RULES[i];
    for (var j = 0; j < rule.keywords.length; j++) {
      if (t.indexOf(rule.keywords[j]) !== -1) return rule.name;
    }
  }
  return "Other";
}

function expenseYears() {
  var years = {};
  expenses.forEach(function (e) {
    years[new Date(e.date).getFullYear()] = true;
  });
  return Object.keys(years).map(Number);
}

function showToast(msg, ms) {
  $("#toast").text(msg).removeClass("d-none");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () {
    $("#toast").addClass("d-none");
  }, ms || 3500);
}

/* ---------- Rendering ---------- */

function renderYearOptions() {
  var current = new Date().getFullYear();
  var years = expenseYears();

  // Always offer a sensible range even with no data
  for (var y = current; y > current - 5; y--) {
    if (years.indexOf(y) === -1) years.push(y);
  }
  years.sort(function (a, b) { return b - a; });

  if (selectedYear === null || years.indexOf(selectedYear) === -1) {
    // Default to the most recent year that actually has data, else current year
    var dataYears = expenseYears().sort(function (a, b) { return b - a; });
    selectedYear = dataYears.length ? dataYears[0] : current;
  }

  var $sel = $("#yearSelect").empty();
  years.forEach(function (y) {
    $sel.append($("<option>").val(y).text(y));
  });
  $sel.val(String(selectedYear));
}

function renderChart() {
  var totals = new Array(12).fill(0);
  expenses.forEach(function (e) {
    var d = new Date(e.date);
    if (d.getFullYear() === selectedYear) totals[d.getMonth()] += Number(e.amount);
  });
  var max = Math.max.apply(null, totals);

  var $chart = $("#chart").empty();
  totals.forEach(function (total, i) {
    var pct = max > 0 ? Math.round((total / max) * 100) : 0;
    var $month = $(
      '<div class="chart-month">' +
      '  <div class="chart-value"></div>' +
      '  <div class="chart-bar"><div class="chart-bar-fill"></div></div>' +
      '  <div class="chart-label">' + MONTHS_SHORT[i] + "</div>" +
      "</div>"
    );
    if (total > 0) {
      $month.find(".chart-value").text(Math.round(total));
      $month.attr("title", MONTHS_LONG[i] + ": " + formatRM(total));
    }
    $chart.append($month);
    // Animate after insertion
    var $fill = $month.find(".chart-bar-fill");
    requestAnimationFrame(function () {
      $fill.css("height", pct + "%");
    });
  });
}

function renderList() {
  var yearExpenses = expenses
    .filter(function (e) { return new Date(e.date).getFullYear() === selectedYear; })
    .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

  var $list = $("#expenseList").empty();

  if (yearExpenses.length === 0) {
    $("#emptyMessage").removeClass("d-none");
    $("#yearTotalStrip").addClass("d-none");
    return;
  }
  $("#emptyMessage").addClass("d-none");

  var total = 0;
  yearExpenses.forEach(function (e) {
    total += Number(e.amount);
    var d = new Date(e.date);
    var $item = $(
      '<div class="expense-item">' +
      '  <div class="expense-date">' +
      '    <span class="ed-month"></span>' +
      '    <span class="ed-year"></span>' +
      '    <span class="ed-day"></span>' +
      "  </div>" +
      '  <div class="expense-main">' +
      '    <div class="expense-title"></div>' +
      '    <span class="expense-category"></span>' +
      "  </div>" +
      '  <div class="expense-amount"></div>' +
      '  <div class="expense-actions">' +
      '    <button type="button" class="edit-btn" title="Edit">✏️</button>' +
      '    <button type="button" class="delete-btn" title="Delete">🗑️</button>' +
      "  </div>" +
      "</div>"
    );
    $item.find(".ed-month").text(MONTHS_LONG[d.getMonth()]);
    $item.find(".ed-year").text(d.getFullYear());
    $item.find(".ed-day").text(d.getDate());
    $item.find(".expense-title").text(e.title);
    $item.find(".expense-category").text(categorize(e.title));
    $item.find(".expense-amount").text(formatRM(e.amount));
    $item.data("id", e.id);
    $list.append($item.hide().fadeIn(250));
  });

  $("#yearTotalStrip").removeClass("d-none")
    .find(".yt-year").text(selectedYear).end()
    .find(".yt-amount").text(formatRM(total));
}

function renderAll() {
  renderYearOptions();
  renderChart();
  renderList();
  $("#aiSummaryYear").text(selectedYear);
  $("#aiSummaryCard").addClass("d-none").empty();
}

/* ---------- Form handling ---------- */

function openForm() {
  $("#addExpenseCollapsed").addClass("d-none");
  $("#addExpenseExpanded").removeClass("d-none");
  $("#titleInput").trigger("focus");
}

function closeForm() {
  editingId = null;
  $("#submitBtn").text("Add Expense");
  $("#expenseForm")[0].reset();
  $("#expenseForm .form-control").removeClass("is-invalid");
  $("#addExpenseExpanded").addClass("d-none");
  $("#addExpenseCollapsed").removeClass("d-none");
}

function validateForm() {
  var ok = true;

  var $title = $("#titleInput");
  if ($title.val().trim() === "") { $title.addClass("is-invalid"); ok = false; }
  else $title.removeClass("is-invalid");

  var $amount = $("#amountInput");
  var amount = parseFloat($amount.val());
  if (isNaN(amount) || amount <= 0) { $amount.addClass("is-invalid"); ok = false; }
  else $amount.removeClass("is-invalid");

  var $date = $("#dateInput");
  if (!$date.val()) { $date.addClass("is-invalid"); ok = false; }
  else $date.removeClass("is-invalid");

  return ok;
}

function handleSubmit(ev) {
  ev.preventDefault();
  if (!validateForm()) return;

  var data = {
    title: $("#titleInput").val().trim(),
    amount: Math.round(parseFloat($("#amountInput").val()) * 100) / 100,
    date: $("#dateInput").val()
  };

  if (editingId) {
    var target = expenses.find(function (e) { return e.id === editingId; });
    if (target) $.extend(target, data);
    showToast("Expense updated.");
  } else {
    expenses.push($.extend({ id: uid() }, data));
    showToast("Expense added.");
  }

  saveExpenses();
  selectedYear = new Date(data.date).getFullYear(); // jump to the year just used
  closeForm();
  renderAll();
}

/* ---------- Edit / delete ---------- */

function handleListClick(ev) {
  var $item = $(ev.target).closest(".expense-item");
  if (!$item.length) return;
  var id = $item.data("id");
  var expense = expenses.find(function (e) { return e.id === id; });
  if (!expense) return;

  if ($(ev.target).closest(".delete-btn").length) {
    if (confirm('Delete "' + expense.title + '"?')) {
      expenses = expenses.filter(function (e) { return e.id !== id; });
      saveExpenses();
      renderAll();
      showToast("Expense deleted.");
    }
  } else if ($(ev.target).closest(".edit-btn").length) {
    editingId = id;
    $("#titleInput").val(expense.title);
    $("#amountInput").val(expense.amount);
    $("#dateInput").val(expense.date);
    $("#submitBtn").text("Save Changes");
    openForm();
  }
}

/* =========================================================
   AI FEATURES
   Both call the same-origin serverless proxy (/api/ai) so the
   API key stays server-side. When the page is opened as a
   local file (no server), the buttons degrade gracefully.
   ========================================================= */

function aiUnavailableMessage() {
  showToast("AI features need the hosted version of this page — everything else works offline.", 5000);
}

function callAI(payload) {
  return fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function (res) {
    if (!res.ok) throw new Error("AI request failed (" + res.status + ")");
    aiAvailable = true;
    return res.json();
  });
}

/* ----- Feature 1: receipt scanning ----- */

function handleReceiptFile(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    showToast("Please use an image under 4 MB.");
    return;
  }

  var reader = new FileReader();
  reader.onload = function () {
    var base64 = String(reader.result).split(",")[1];
    setScanLoading(true);

    callAI({ action: "receipt", image: base64, mimeType: file.type || "image/jpeg" })
      .then(function (data) {
        if (data.title)  $("#titleInput").val(data.title);
        if (data.amount) $("#amountInput").val(data.amount);
        if (data.date)   $("#dateInput").val(data.date);
        $("#expenseForm .form-control").removeClass("is-invalid");
        showToast("Receipt scanned — please review before adding.");
      })
      .catch(function () {
        aiAvailable = false;
        aiUnavailableMessage();
      })
      .finally(function () {
        setScanLoading(false);
        $("#receiptInput").val("");
      });
  };
  reader.readAsDataURL(file);
}

function setScanLoading(loading) {
  $("#scanReceiptBtn").prop("disabled", loading);
  $("#scanReceiptSpinner").toggleClass("d-none", !loading);
  $("#scanReceiptLabel").text(loading ? "Reading receipt… " : "📷 Scan a receipt (AI)");
}

/* ----- Feature 2: yearly AI insights ----- */

function handleAISummary() {
  var yearExpenses = expenses
    .filter(function (e) { return new Date(e.date).getFullYear() === selectedYear; })
    .map(function (e) { return { title: e.title, amount: e.amount, date: e.date, category: categorize(e.title) }; });

  if (yearExpenses.length === 0) {
    showToast("No expenses in " + selectedYear + " to analyse.");
    return;
  }

  setSummaryLoading(true);
  callAI({ action: "summary", year: selectedYear, expenses: yearExpenses })
    .then(function (data) {
      $("#aiSummaryCard").text(data.summary || "No insights returned.").removeClass("d-none");
    })
    .catch(function () {
      aiAvailable = false;
      aiUnavailableMessage();
    })
    .finally(function () {
      setSummaryLoading(false);
    });
}

function setSummaryLoading(loading) {
  $("#aiSummaryBtn").prop("disabled", loading);
  $("#aiSummarySpinner").toggleClass("d-none", !loading);
}

/* ---------- Init ---------- */

$(function () {
  loadExpenses();
  renderAll();

  // If opened via file:// there is definitely no serverless proxy
  if (location.protocol === "file:") {
    aiAvailable = false;
    $("#receiptHint").text("AI features are available in the hosted version.");
  }

  $("#showFormBtn").on("click", openForm);
  $("#cancelBtn").on("click", closeForm);
  $("#expenseForm").on("submit", handleSubmit);

  $("#yearSelect").on("change", function () {
    selectedYear = Number($(this).val());
    renderAll();
  });

  $("#expenseList").on("click", handleListClick);

  $("#scanReceiptBtn").on("click", function () {
    if (aiAvailable === false) { aiUnavailableMessage(); return; }
    $("#receiptInput").trigger("click");
  });
  $("#receiptInput").on("change", function () {
    handleReceiptFile(this.files[0]);
  });

  $("#aiSummaryBtn").on("click", function () {
    if (aiAvailable === false) { aiUnavailableMessage(); return; }
    handleAISummary();
  });
});
