(function () {
  "use strict";

  const state = {
    token: localStorage.getItem("schoolpay_token") || "",
    apiBase: localStorage.getItem("schoolpay_api_base") || defaultApiBase(),
    user: readJson("schoolpay_user"),
    file: null,
    preview: null,
    rows: [],
    demo: false,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    loginView: $("login-view"), appView: $("app-view"), loginForm: $("login-form"),
    email: $("login-email"), password: $("login-password"), apiBase: $("api-base"), loginError: $("login-error"),
    loading: $("loading-overlay"), loadingText: $("loading-text"), school: $("school-select"), year: $("year-select"),
    sheet: $("sheet-name"), fileInput: $("file-input"), dropzone: $("dropzone"), selectedFile: $("selected-file"),
    fileName: $("file-name"), fileSize: $("file-size"), previewButton: $("preview-button"), previewSection: $("preview-section"),
    rows: $("student-rows"), search: $("table-search"), empty: $("empty-state"), demoBadge: $("demo-badge"),
  };

  function defaultApiBase() {
    return location.pathname.startsWith("/qr-import") ? location.origin : "";
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
  }

  function normalizeBase(value) { return String(value || "").trim().replace(/\/$/, ""); }

  async function request(path, options) {
    const config = Object.assign({}, options || {});
    config.headers = Object.assign({}, config.headers || {});
    if (state.token) config.headers.Authorization = "Bearer " + state.token;
    if (config.body && !(config.body instanceof FormData) && typeof config.body !== "string") {
      config.headers["Content-Type"] = "application/json";
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(normalizeBase(state.apiBase) + path, config);
    if (options && options.blob) {
      if (!response.ok) throw await responseError(response);
      return response.blob();
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      const message = payload.error && payload.error.message ? payload.error.message : "Không thể kết nối máy chủ";
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return payload && payload.success === true ? payload.data : payload;
  }

  async function responseError(response) {
    const payload = await response.json().catch(() => ({}));
    return new Error(payload.error && payload.error.message ? payload.error.message : "Tải file không thành công");
  }

  function paginatedRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
  }

  function showLoading(message) { els.loadingText.textContent = message || "Đang xử lý..."; els.loading.hidden = false; }
  function hideLoading() { els.loading.hidden = true; }

  function toast(title, detail, error) {
    const item = document.createElement("div");
    item.className = "toast" + (error ? " toast-error" : "");
    item.innerHTML = "<span>" + (error ? "!" : "✓") + "</span><div><strong></strong><small></small></div><button type=\"button\" aria-label=\"Đóng\">×</button>";
    item.querySelector("strong").textContent = title;
    item.querySelector("small").textContent = detail || "";
    item.querySelector("button").addEventListener("click", () => item.remove());
    $("toast-stack").appendChild(item);
    window.setTimeout(() => item.remove(), 5200);
  }

  async function login(event) {
    event.preventDefault();
    els.loginError.textContent = "";
    state.apiBase = normalizeBase(els.apiBase.value);
    localStorage.setItem("schoolpay_api_base", state.apiBase);
    showLoading("Đang đăng nhập...");
    try {
      const data = await request("/auth/login", { method: "POST", body: { email: els.email.value.trim(), password: els.password.value } });
      state.token = data.accessToken;
      state.user = data.user;
      localStorage.setItem("schoolpay_token", state.token);
      localStorage.setItem("schoolpay_user", JSON.stringify(state.user));
      await enterApp();
    } catch (error) {
      els.loginError.textContent = error.message;
    } finally { hideLoading(); }
  }

  async function enterApp() {
    els.loginView.hidden = true;
    els.appView.hidden = false;
    els.demoBadge.hidden = !state.demo;
    const name = state.user && (state.user.fullName || state.user.email) || "Kế toán trường";
    $("user-name").textContent = name;
    $("user-role").textContent = state.user && state.user.role || "ACCOUNTANT";
    $("user-avatar").textContent = initials(name);
    if (!state.demo) await loadSchools();
  }

  function logout() {
    state.token = ""; state.user = null; state.demo = false; state.preview = null; state.rows = [];
    localStorage.removeItem("schoolpay_token"); localStorage.removeItem("schoolpay_user");
    els.appView.hidden = true; els.loginView.hidden = false; els.previewSection.hidden = true;
  }

  async function loadSchools() {
    try {
      const data = await request("/schools?limit=100&sortBy=name&sortOrder=ASC");
      fillSelect(els.school, paginatedRows(data), "Chọn trường học", "name");
      if (state.user && state.user.schoolId) { els.school.value = state.user.schoolId; await loadYears(state.user.schoolId); }
    } catch (error) {
      if (error.status === 401) return logout();
      toast("Không tải được trường học", error.message, true);
    }
  }

  async function loadYears(schoolId) {
    els.year.disabled = true;
    fillSelect(els.year, [], "Đang tải năm học...", "name");
    if (!schoolId) { fillSelect(els.year, [], "Chọn năm học", "name"); return; }
    try {
      const data = await request("/academic-years?limit=100&schoolId=" + encodeURIComponent(schoolId) + "&sortBy=startDate&sortOrder=DESC");
      const years = paginatedRows(data);
      fillSelect(els.year, years, "Chọn năm học", "name");
      els.year.disabled = false;
      const active = years.find((item) => item.status === "ACTIVE");
      if (active) els.year.value = active.id;
    } catch (error) { fillSelect(els.year, [], "Không tải được năm học", "name"); toast("Lỗi năm học", error.message, true); }
  }

  function fillSelect(select, items, placeholder, labelKey) {
    select.innerHTML = "";
    const first = document.createElement("option"); first.value = ""; first.textContent = placeholder; select.appendChild(first);
    items.forEach((item) => { const option = document.createElement("option"); option.value = item.id; option.textContent = item[labelKey]; select.appendChild(option); });
  }

  function selectFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) return toast("File chưa đúng định dạng", "Vui lòng chọn file Excel .xlsx", true);
    if (file.size > 10 * 1024 * 1024) return toast("File quá lớn", "Dung lượng tối đa là 10 MB", true);
    state.file = file;
    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatFileSize(file.size);
    els.selectedFile.hidden = false;
    updatePreviewButton();
  }

  function removeFile() { state.file = null; els.fileInput.value = ""; els.selectedFile.hidden = true; updatePreviewButton(); }
  function updatePreviewButton() { els.previewButton.disabled = !(state.file && els.school.value && els.year.value && els.sheet.value.trim()); }

  async function previewImport() {
    if (!state.file) return;
    const body = new FormData();
    body.append("file", state.file); body.append("schoolId", els.school.value); body.append("academicYearId", els.year.value);
    body.append("sheetName", els.sheet.value.trim()); body.append("type", "STUDENTS");
    showLoading("Đang đọc và kiểm tra file Excel...");
    try {
      const data = await request("/imports/excel/preview", { method: "POST", body });
      state.preview = data; state.rows = data.rows || [];
      renderPreview(data);
      toast("Đã kiểm tra dữ liệu", data.validRows + " học sinh hợp lệ, " + data.invalidRows + " dòng cần kiểm tra.");
    } catch (error) { toast("Không thể import file", error.message, true); }
    finally { hideLoading(); }
  }

  function renderPreview(data) {
    $("summary-total").textContent = formatNumber(data.totalRows || 0);
    $("summary-valid").textContent = formatNumber(data.validRows || 0);
    $("summary-invalid").textContent = formatNumber(data.invalidRows || 0);
    $("summary-amount").textContent = money(state.rows.reduce((sum, row) => sum + Number(row.originalAmount || 0), 0));
    $("table-caption").textContent = "Đã đọc " + (data.totalRows || 0) + " dòng từ sheet “" + els.sheet.value.trim() + "”.";
    renderErrors(data.errors || []);
    renderRows(state.rows);
    els.previewSection.hidden = false;
    setStep(2);
    els.previewSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderErrors(errors) {
    const panel = $("validation-errors");
    const list = $("validation-error-list");
    list.innerHTML = "";
    errors.slice(0, 8).forEach((error) => {
      const item = document.createElement("li");
      item.textContent = "Dòng " + error.row + (error.column ? " · " + error.column : "") + ": " + error.message;
      list.appendChild(item);
    });
    if (errors.length > 8) {
      const item = document.createElement("li");
      item.textContent = "Và " + (errors.length - 8) + " lỗi khác";
      list.appendChild(item);
    }
    panel.hidden = errors.length === 0;
  }

  function renderRows(rows) {
    els.rows.innerHTML = "";
    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.dataset.search = [row.fullName, row.identifierCode, row.className].join(" ").toLowerCase();
      tr.innerHTML = "<td>" + (index + 1) + "</td>" +
        "<td><div class=\"student-cell\"><span class=\"student-avatar\"></span><div><strong></strong><small></small></div></div></td>" +
        "<td class=\"date-cell\"></td><td class=\"class-cell\"></td><td class=\"id-cell\"></td><td class=\"money\"></td><td><span class=\"status-pill\">Hợp lệ</span></td>";
      tr.querySelector(".student-avatar").textContent = initials(row.fullName);
      tr.querySelector(".student-cell strong").textContent = row.fullName || "—";
      tr.querySelector(".student-cell small").textContent = row.parentPhone || "Chưa có SĐT phụ huynh";
      tr.querySelector(".date-cell").textContent = displayDate(row.dateOfBirth);
      tr.querySelector(".class-cell").textContent = row.className || row.classCode || "—";
      tr.querySelector(".id-cell").textContent = row.identifierCode || "—";
      tr.querySelector(".money").textContent = money(row.originalAmount || 0);
      els.rows.appendChild(tr);
    });
    els.empty.hidden = rows.length > 0;
  }

  async function confirmImport() {
    if (state.demo) return toast("Chế độ xem thử", "Kết nối backend để xác nhận dữ liệu thực.");
    if (!state.preview) return;
    showLoading("Đang lưu danh sách học sinh...");
    try {
      await request("/imports/excel/confirm", { method: "POST", body: { importSessionId: state.preview.importSessionId } });
      $("confirm-button").disabled = true; $("confirm-button").textContent = "Đã xác nhận"; setStep(3);
      toast("Import thành công", "Danh sách học sinh đã được lưu. Bạn có thể tải PDF ngay bây giờ.");
    } catch (error) { toast("Không thể xác nhận", error.message, true); }
    finally { hideLoading(); }
  }

  async function downloadPdf() {
    if (state.demo) return toast("Chế độ xem thử", "Kết nối backend để tải file PDF thật.");
    if (!state.preview) return;
    showLoading("Đang tạo PDF mã QR...");
    try {
      const path = state.preview.paymentQrPdfUrl || ("/imports/" + state.preview.importSessionId + "/payment-qr.pdf");
      const blob = await request(path, { blob: true });
      downloadBlob(blob, "ma-qr-" + (els.sheet.value.trim() || "lop") + ".pdf"); setStep(3);
      toast("Đã tạo PDF", "File gồm " + state.rows.length + " phiếu thanh toán đã được tải xuống.");
    } catch (error) { toast("Không thể xuất PDF", error.message, true); }
    finally { hideLoading(); }
  }

  async function downloadTemplate() {
    if (state.demo) return toast("Chế độ xem thử", "Kết nối backend để tải file mẫu.");
    showLoading("Đang tải file mẫu...");
    try { downloadBlob(await request("/imports/excel/template?type=STUDENTS", { blob: true }), "mau-import-hoc-sinh.xlsx"); }
    catch (error) { toast("Không thể tải file mẫu", error.message, true); }
    finally { hideLoading(); }
  }

  function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }

  function demo() {
    state.demo = true; state.user = { fullName: "Nguyễn Minh Anh", role: "ACCOUNTANT" };
    const schools = [{ id: "demo-school", name: "Trường Tiểu học Võ Thị Sáu" }];
    fillSelect(els.school, schools, "Chọn trường học", "name"); els.school.value = "demo-school";
    fillSelect(els.year, [{ id: "demo-year", name: "2026-2027" }], "Chọn năm học", "name"); els.year.value = "demo-year"; els.year.disabled = false;
    state.preview = { importSessionId: "demo", totalRows: 2, validRows: 2, invalidRows: 0 };
    state.rows = [
      demoRow("Phan Dương Linh Đan", "2018-09-21", "0358228913", "072318004706"),
      demoRow("Lê Chấn Hưng", "2019-10-08", "0918569863", "072218005492"),
    ];
    enterApp(); renderPreview(state.preview);
  }

  function demoRow(fullName, dateOfBirth, parentPhone, identifierCode) {
    return { fullName, dateOfBirth, parentPhone, identifierCode, className: "3A4", originalAmount: "560000.00" };
  }

  function reset() { state.preview = null; state.rows = []; removeFile(); els.previewSection.hidden = true; setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function setStep(active) { document.querySelectorAll(".step").forEach((node, index) => { node.classList.toggle("step-active", index + 1 === active); node.classList.toggle("step-complete", index + 1 < active); }); }
  function initials(name) { return String(name || "HS").trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase(); }
  function money(value) { return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function formatNumber(value) { return new Intl.NumberFormat("vi-VN").format(value); }
  function formatFileSize(bytes) { return bytes > 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB"; }
  function displayDate(value) { const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return match ? match[3] + "/" + match[2] + "/" + match[1] : value || "—"; }

  els.loginForm.addEventListener("submit", login);
  els.apiBase.value = state.apiBase;
  $("toggle-password").addEventListener("click", () => { els.password.type = els.password.type === "password" ? "text" : "password"; });
  $("demo-button").addEventListener("click", demo);
  $("profile-button").addEventListener("click", () => { if (confirm("Đăng xuất khỏi SchoolPay?")) logout(); });
  $("menu-button").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("sidebar-open"));
  els.school.addEventListener("change", async () => { if (!state.demo) await loadYears(els.school.value); updatePreviewButton(); });
  els.year.addEventListener("change", updatePreviewButton); els.sheet.addEventListener("input", updatePreviewButton);
  els.dropzone.addEventListener("click", () => els.fileInput.click());
  els.dropzone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") els.fileInput.click(); });
  els.fileInput.addEventListener("change", () => selectFile(els.fileInput.files[0]));
  ["dragenter", "dragover"].forEach((name) => els.dropzone.addEventListener(name, (event) => { event.preventDefault(); els.dropzone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((name) => els.dropzone.addEventListener(name, (event) => { event.preventDefault(); els.dropzone.classList.remove("dragging"); }));
  els.dropzone.addEventListener("drop", (event) => selectFile(event.dataTransfer.files[0]));
  $("remove-file").addEventListener("click", removeFile); els.previewButton.addEventListener("click", previewImport);
  $("confirm-button").addEventListener("click", confirmImport); $("pdf-button").addEventListener("click", downloadPdf);
  $("download-template").addEventListener("click", downloadTemplate); $("reset-button").addEventListener("click", reset);
  els.search.addEventListener("input", () => { const q = els.search.value.trim().toLowerCase(); let shown = 0; els.rows.querySelectorAll("tr").forEach((row) => { const visible = !q || row.dataset.search.includes(q); row.hidden = !visible; if (visible) shown += 1; }); els.empty.hidden = shown > 0; });

  if (state.token) enterApp().catch((error) => { toast("Phiên đăng nhập không hợp lệ", error.message, true); logout(); });
})();
