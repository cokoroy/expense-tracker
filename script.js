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

/* Simple keyword rules for auto-categorization (instant, works offline).
   These are the fast first guess — the AI refines them in the background. */
var CATEGORY_RULES = [
  { name: "Food & Drinks", keywords: ["nasi","ayam","mee","maggi","roti","satay","laksa","gepuk","makan","teh","kopi","tealive","zus","boba","bubble tea","lunch","dinner","breakfast","coffee","cafe","restaurant","food","mamak","warung","kfc","mcd","mcdonald","pizza","burger","grabfood","foodpanda","shopeefood","snack","kuih","western","bakery"] },
  { name: "Transport",     keywords: ["petrol","fuel","ron95","ron97","grab","toll","parking","train","bus","lrt","mrt","ktm","car service","tyre","touch n go","tng","rapid","gojek","flight","airasia"] },
  { name: "Bills & Utilities", keywords: ["insurance","insurans","bill","electric","tnb","water","air selangor","wifi","internet","phone","prepaid","postpaid","celcom","maxis","digi","umobile","u mobile","yes 5g","topup","top up","astro","unifi","rent","sewa","loan","pinjaman","zakat"] },
  { name: "Shopping",      keywords: ["tv","desk","shirt","baju","kasut","shoes","shopee","lazada","tiktok shop","clothes","bag","furniture","ikea","mr diy","mr. diy","watch","laptop","mouse","keyboard"] },
  { name: "Health & Fitness", keywords: ["gym","protein","creatine","clinic","klinik","pharmacy","farmasi","guardian","watsons","vitamin","supplement","doctor","dental","gigi"] },
  { name: "Entertainment", keywords: ["movie","cinema","gsc","tgv","game","steam","ps5","xbox","netflix","spotify","youtube premium","concert","karaoke","bowling"] }
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
    $item.find(".expense-category").text(e.category || categorize(e.title));
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
  $("#insightSection").addClass("d-none");
  $("#aiSummaryText").addClass("d-none").empty();
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
    if (target) {
      $.extend(target, data);
      delete target.category; // title may have changed — re-categorize
    }
    showToast("Expense updated.");
  } else {
    expenses.push($.extend({ id: uid() }, data));
    showToast("Expense added.");
  }

  saveExpenses();
  selectedYear = new Date(data.date).getFullYear(); // jump to the year just used
  closeForm();
  renderAll();
  aiCategorizePending(); // refine the new expense's tag in the background
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

/* ----- Feature 2: yearly insights (pie chart + AI analysis) ----- */

var PIE_COLORS = ["#7b3fbf", "#b39ddb", "#4826a8", "#e2c7ff", "#9955e8", "#5e35b1", "#cbb3ea"];

function renderPie(yearExpenses) {
  // Total per category, largest first
  var totals = {};
  yearExpenses.forEach(function (e) {
    totals[e.category] = (totals[e.category] || 0) + Number(e.amount);
  });
  var entries = Object.keys(totals)
    .map(function (name) { return { name: name, amount: totals[name] }; })
    .sort(function (a, b) { return b.amount - a.amount; });

  var grand = entries.reduce(function (s, e) { return s + e.amount; }, 0);

  // Build the conic-gradient (each slice from its start angle to end angle)
  var stops = [];
  var angle = 0;
  var $legend = $("#pieLegend").empty();

  entries.forEach(function (entry, i) {
    var color = PIE_COLORS[i % PIE_COLORS.length];
    var slice = (entry.amount / grand) * 360;
    stops.push(color + " " + angle + "deg " + (angle + slice) + "deg");
    angle += slice;

    var pct = Math.round((entry.amount / grand) * 100);
    var $li = $(
      '<li><span class="dot"></span>' +
      '<span class="cat-name"></span>' +
      '<span class="cat-amount"></span></li>'
    );
    $li.find(".dot").css("background", color);
    $li.find(".cat-name").text(entry.name + " (" + pct + "%)");
    $li.find(".cat-amount").text(formatRM(entry.amount));
    $legend.append($li);
  });

  $("#pieChart").css("background", "conic-gradient(" + stops.join(", ") + ")");
}

function handleAISummary() {
  var yearExpenses = expenses
    .filter(function (e) { return new Date(e.date).getFullYear() === selectedYear; })
    .map(function (e) {
      return { title: e.title, amount: e.amount, date: e.date, category: e.category || categorize(e.title) };
    });

  if (yearExpenses.length === 0) {
    showToast("No expenses in " + selectedYear + " to analyse.");
    return;
  }

  // 1) Pie chart renders instantly from local data — no AI needed
  renderPie(yearExpenses);
  $("#insightSection").removeClass("d-none");
  $("#aiSummaryText").addClass("d-none").empty();

  // 2) AI paragraph loads underneath
  if (aiAvailable === false) {
    $("#aiSummaryText")
      .text("AI analysis is available in the hosted version — the chart above is computed locally.")
      .removeClass("d-none");
    return;
  }

  $("#aiSummaryLoading").removeClass("d-none");
  setSummaryLoading(true);
  callAI({ action: "summary", year: selectedYear, expenses: yearExpenses })
    .then(function (data) {
      $("#aiSummaryText").text(data.summary || "No insights returned.").removeClass("d-none");
    })
    .catch(function () {
      aiAvailable = false;
      $("#aiSummaryText")
        .text("AI analysis is unavailable right now — the chart above is computed locally.")
        .removeClass("d-none");
    })
    .finally(function () {
      $("#aiSummaryLoading").addClass("d-none");
      setSummaryLoading(false);
    });
}

function setSummaryLoading(loading) {
  $("#aiSummaryBtn").prop("disabled", loading);
  $("#aiSummarySpinner").toggleClass("d-none", !loading);
}

/* ----- Feature 3: AI categorization (background refinement) -----
   Keyword rules give an instant guess; this sends any expense without a
   stored category to the AI in ONE batch call and corrects the tags.
   If the AI is unreachable, the keyword tags simply remain. */

function aiCategorizePending() {
  if (aiAvailable === false) return;

  var pending = expenses
    .filter(function (e) { return !e.category; })
    .map(function (e) { return { id: e.id, title: e.title }; });

  if (pending.length === 0) return;

  callAI({ action: "categorize", items: pending })
    .then(function (data) {
      var changed = false;
      expenses.forEach(function (e) {
        if (data.categories && data.categories[e.id]) {
          e.category = data.categories[e.id];
          changed = true;
        }
      });
      if (changed) {
        saveExpenses();
        renderList(); // update tags in place
      }
    })
    .catch(function () { /* silent — keyword-based tags remain */ });
}

/* ---------- Init ---------- */

$(function () {
  loadExpenses();
  renderAll();
  aiCategorizePending(); // fix tags for any expenses added before AI categorization existed

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

  // The pie chart works offline; only the AI paragraph needs the server
  $("#aiSummaryBtn").on("click", handleAISummary);
});