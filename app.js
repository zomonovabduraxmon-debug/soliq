(() => {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const state = {
    client: null,
    user: null,
    tab: 'dashboard',
    period: currentMonthKey(),
    organizations: [],
    reports: [],
    statuses: [],
    finances: [],
    payments: [],
    search: '',
    pendingPfxOrganizationId: null,
    lastUserId: null,
    busy: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const view = {
    setup: $('#setupView'), auth: $('#authView'), app: $('#appView'),
    content: $('#pageContent'), heading: $('#pageHeading'), period: $('#periodInput'),
    email: $('#userEmailLabel'), loginForm: $('#loginForm'), loginError: $('#loginError'),
    orgDialog: $('#orgDialog'), orgForm: $('#orgForm'), paymentDialog: $('#paymentDialog'),
    paymentForm: $('#paymentForm'), historyDialog: $('#historyDialog')
  };

  function currentMonthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function periodToDate(period) { return new Date(`${period}-01T12:00:00`); }
  function formatPeriod(period) {
    if (!period) return '—';
    return new Intl.DateTimeFormat('uz-UZ', { month: 'long', year: 'numeric' }).format(periodToDate(period));
  }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }
  function formatMoney(amount) {
    const value = Number(amount || 0);
    return `${new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(value)} so‘m`;
  }
  function moneyNumber(amount) { return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 0 }).format(Number(amount || 0)); }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function monthIndex(period) {
    const [year, month] = period.split('-').map(Number);
    return year * 12 + month - 1;
  }
  function periodSequence(from, to) {
    if (!from || !to || monthIndex(from) > monthIndex(to)) return [];
    const result = [];
    for (let i = monthIndex(from); i <= monthIndex(to); i++) {
      const year = Math.floor(i / 12);
      const month = (i % 12) + 1;
      result.push(`${year}-${String(month).padStart(2, '0')}`);
    }
    return result;
  }
  function dueDateFor(period, deadlineDay = 15) {
    const [year, month] = period.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(Math.max(1, Number(deadlineDay || 15)), lastDay)).padStart(2, '0')}`;
  }
  function statusMeta(status) {
    if (status?.submitted) return { label: 'Topshirilgan', cls: 'status-success' };
    if (status?.due_date && status.due_date < todayIso()) return { label: 'Muddati o‘tgan', cls: 'status-danger' };
    return { label: 'Kutilmoqda', cls: 'status-warning' };
  }
  function showToast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    $('#toastRegion').append(node);
    window.setTimeout(() => node.remove(), 4300);
  }
  function showFormError(target, message) {
    target.textContent = message;
    target.classList.remove('hidden');
  }
  function clearFormError(target) {
    target.textContent = '';
    target.classList.add('hidden');
  }
  function friendlyError(error) {
    const message = error?.message || String(error || 'Noma’lum xatolik');
    if (/Invalid login credentials/i.test(message)) return 'Email yoki parol noto‘g‘ri.';
    if (/duplicate key|already exists|unique constraint/i.test(message)) return 'Bu INN bilan tashkilot allaqachon mavjud yoki ma’lumot takrorlangan.';
    if (/row-level security|violates row-level security/i.test(message)) return 'Kirish ruxsati yo‘q. SQL siyosatlari o‘rnatilganini tekshiring.';
    if (/Failed to fetch|NetworkError/i.test(message)) return 'Internet yoki Supabase ulanishini tekshiring.';
    return message;
  }
  function requireResult(result, label = 'So‘rov') {
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    return result.data;
  }
  async function fetchAllRows(queryFactory, label = 'Ma’lumotlarni olish', pageSize = 1000) {
    const rows = [];
    let start = 0;
    while (true) {
      const { data, error } = await queryFactory().range(start, start + pageSize - 1);
      if (error) throw new Error(`${label}: ${error.message}`);
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
      start += pageSize;
    }
    return rows;
  }
  function showSetup() {
    view.setup.classList.remove('hidden');
    view.auth.classList.add('hidden');
    view.app.classList.add('hidden');
  }
  function showAuth() {
    view.setup.classList.add('hidden');
    view.auth.classList.remove('hidden');
    view.app.classList.add('hidden');
  }
  function showApp() {
    view.setup.classList.add('hidden');
    view.auth.classList.add('hidden');
    view.app.classList.remove('hidden');
    view.email.textContent = state.user?.email || 'Buxgalter';
  }
  function setTab(tab) {
    state.tab = tab;
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    const names = { dashboard: 'Dashboard', organizations: 'Tashkilotlar', reports: 'Hisobotlar nazorati', finance: 'Moliyaviy holat' };
    view.heading.textContent = names[tab] || 'Dashboard';
    $('#sidebar').classList.remove('open');
    renderPage();
  }

  async function handleSession(session) {
    const user = session?.user || null;
    if (!user) {
      state.user = null;
      state.lastUserId = null;
      showAuth();
      return;
    }
    if (state.lastUserId === user.id && !view.app.classList.contains('hidden')) return;
    state.user = user;
    state.lastUserId = user.id;
    showApp();
    $('#yearNow').textContent = new Date().getFullYear();
    view.period.value = state.period;
    try {
      await refreshData(true);
    } catch (error) {
      console.error(error);
      showToast(friendlyError(error), 'error');
      view.content.innerHTML = `<div class="panel"><div class="empty-state"><div class="empty-icon">!</div><strong>Ma’lumotlarni yuklab bo‘lmadi</strong><span>${escapeHtml(friendlyError(error))}</span><button class="btn btn-light" data-action="reload-data">Qayta urinish</button></div></div>`;
    }
  }

  async function refreshData(showLoading = false) {
    if (!state.client || !state.user) return;
    if (showLoading) view.content.innerHTML = '<div class="loading-state"><div class="loader"></div><span>Ma’lumotlar yuklanmoqda...</span></div>';
    const organizations = requireResult(await state.client.from('organizations').select('*').order('name', { ascending: true }), 'Tashkilotlarni olish');
    const reports = requireResult(await state.client.from('organization_reports').select('*').order('report_name', { ascending: true }), 'Hisobot turlarini olish');
    state.organizations = organizations || [];
    state.reports = reports || [];

    await ensureReportStatuses(state.period);
    const currentMonth = currentMonthKey();
    const financeThrough = monthIndex(state.period) > monthIndex(currentMonth) ? state.period : currentMonth;
    await ensureFinanceRows(financeThrough);

    state.statuses = requireResult(await state.client.from('report_statuses').select('*').eq('period_key', state.period), 'Hisobot holatlarini olish') || [];
    state.finances = await fetchAllRows(() => state.client.from('monthly_finances').select('*').order('period_key', { ascending: false }), 'Moliyaviy yozuvlarni olish');
    state.payments = await fetchAllRows(() => state.client.from('payments').select('*').order('paid_at', { ascending: false }), 'To‘lovlarni olish');
    renderPage();
  }

  async function ensureReportStatuses(period) {
    const enabledReports = state.reports.filter(report => report.enabled);
    if (!enabledReports.length) return;
    const existingRows = requireResult(await state.client.from('report_statuses').select('organization_report_id').eq('period_key', period), 'Hisobot yozuvlarini tekshirish') || [];
    const present = new Set(existingRows.map(row => row.organization_report_id));
    const missing = enabledReports.filter(report => !present.has(report.id)).map(report => ({
      owner_id: state.user.id,
      organization_report_id: report.id,
      period_key: period,
      due_date: dueDateFor(period, report.deadline_day),
      submitted: false,
      submitted_at: null
    }));
    for (let i = 0; i < missing.length; i += 100) {
      requireResult(await state.client.from('report_statuses').insert(missing.slice(i, i + 100)), 'Hisobot davrini yaratish');
    }
  }

  async function ensureFinanceRows(untilPeriod) {
    if (!state.organizations.length) return;
    const existingRows = await fetchAllRows(() => state.client.from('monthly_finances').select('organization_id,period_key'), 'Moliyaviy davrlarni tekshirish');
    const present = new Set(existingRows.map(row => `${row.organization_id}|${row.period_key}`));
    const missing = [];
    for (const org of state.organizations) {
      const start = org.billing_start_period || String(org.created_at || untilPeriod).slice(0, 7);
      for (const period of periodSequence(start, untilPeriod)) {
        const key = `${org.id}|${period}`;
        if (!present.has(key)) {
          missing.push({ owner_id: state.user.id, organization_id: org.id, period_key: period, amount_due: Number(org.monthly_fee || 0) });
          present.add(key);
        }
      }
    }
    for (let i = 0; i < missing.length; i += 100) {
      requireResult(await state.client.from('monthly_finances').insert(missing.slice(i, i + 100)), 'Oylik majburiyatlarni yaratish');
    }
  }

  function getStatusRow(report) { return state.statuses.find(row => row.organization_report_id === report.id); }
  function getOrg(orgId) { return state.organizations.find(org => org.id === orgId); }
  function reportRows() {
    const active = state.reports.filter(report => report.enabled);
    return active.map(report => ({ report, organization: getOrg(report.organization_id), status: getStatusRow(report) })).filter(row => row.organization && row.status);
  }
  function allPaymentTotal(orgId = null, period = null) {
    return state.payments.filter(payment => (!orgId || payment.organization_id === orgId) && (!period || payment.period_key === period)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }
  function dueTotal(orgId = null, period = null) {
    return state.finances.filter(row => (!orgId || row.organization_id === orgId) && (!period || row.period_key === period)).reduce((sum, row) => sum + Number(row.amount_due || 0), 0);
  }
  function outstandingForOrg(orgId) {
    return Math.max(0, dueTotal(orgId) - allPaymentTotal(orgId));
  }
  function outstandingForPeriod(orgId, period) {
    const due = state.finances.filter(row => row.organization_id === orgId && row.period_key === period).reduce((sum, row) => sum + Number(row.amount_due || 0), 0);
    return Math.max(0, due - allPaymentTotal(orgId, period));
  }
  function statusBadge(status) {
    const meta = statusMeta(status);
    return `<span class="status ${meta.cls}">${meta.label}</span>`;
  }
  function statCard(label, value, icon, foot, style = '') {
    return `<article class="stat-card ${style}"><div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
  }
  function emptyState(title, detail, icon = '⌕') {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
  }
  function tableShell(headers, rows, emptyTitle = 'Ma’lumot yo‘q', emptyDetail = 'Ma’lumotlar qo‘shilganda shu yerda ko‘rinadi.') {
    if (!rows.length) return emptyState(emptyTitle, emptyDetail);
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${headers.map(head => `<th>${head}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function renderPage() {
    if (!state.user) return;
    if (state.tab === 'dashboard') renderDashboard();
    else if (state.tab === 'organizations') renderOrganizations();
    else if (state.tab === 'reports') renderReports();
    else if (state.tab === 'finance') renderFinance();
  }

  function renderDashboard() {
    const rows = reportRows();
    const submitted = rows.filter(row => row.status.submitted).length;
    const overdue = rows.filter(row => !row.status.submitted && row.status.due_date < todayIso()).length;
    const pending = rows.filter(row => !row.status.submitted && row.status.due_date >= todayIso()).length;
    const missing = rows.filter(row => !row.status.submitted).sort((a, b) => a.status.due_date.localeCompare(b.status.due_date));
    const recentRows = missing.slice(0, 12).map(({ organization, report, status }) => `<tr>
      <td><span class="cell-primary">${escapeHtml(organization.name)}</span><span class="cell-secondary">STIR: ${escapeHtml(organization.inn)}</span></td>
      <td>${escapeHtml(report.report_name)}</td><td>${statusBadge(status)}</td><td>${escapeHtml(formatPeriod(state.period))}</td><td>${formatDate(status.due_date)}</td>
    </tr>`);
    const deadlineRows = missing.slice(0, 6).map(({ organization, report, status }) => {
      const meta = statusMeta(status);
      return `<div class="deadline-item"><div class="deadline-line"><div class="deadline-org"><strong>${escapeHtml(organization.name)}</strong><span>${escapeHtml(report.report_name)}</span></div>${statusBadge(status)}</div><div class="deadline-foot"><span>Hisobot davri: ${escapeHtml(formatPeriod(state.period))}</span><strong class="${meta.cls === 'status-danger' ? 'text-red' : ''}">${formatDate(status.due_date)}</strong></div></div>`;
    }).join('');

    view.content.innerHTML = `
      <div class="page-intro"><div><p class="eyebrow">UMUMIY NAZORAT</p><h1>Dashboard</h1><p>Tashkilotlar va hisobotlarning holati bir joyda.</p></div><div class="intro-actions"><button class="btn btn-light" data-action="go-reports">Hisobotlarni belgilash <span>→</span></button></div></div>
      <div class="hint-box"><span>✦</span><div><strong>${escapeHtml(formatPeriod(state.period))}</strong> davri tanlangan. Hisobot topshirilganini belgilash uchun “Hisobotlar nazorati” bo‘limiga o‘ting.</div></div>
      <section class="stats-grid">
        ${statCard('Jami tashkilotlar', state.organizations.length, '▦', 'Bazaga kiritilgan tashkilotlar', 'accent')}
        ${statCard('Topshirilgan hisobotlar', submitted, '✓', `${rows.length} ta belgilangan hisobot ichidan`, 'success')}
        ${statCard('Kutilayotgan hisobotlar', pending, '◷', 'Muddat hali tugamagan', 'warning')}
        ${statCard('Muddati o‘tgan', overdue, '!', 'Topshirilmagan va muddati o‘tgan', 'danger')}
      </section>
      <section class="content-grid">
        <div class="panel"><div class="panel-head"><div><h2>Topshirilmagan hisobotlar</h2><p>Har bir tashkilot bo‘yicha qaysi hisobot qolganini ko‘ring.</p></div><button class="inline-link" data-action="go-reports">Barchasi →</button></div>
          ${tableShell(['Tashkilot', 'Soliq turi', 'Holati', 'Davri', 'Topshirish muddati'], recentRows, 'Topshirilmagan hisobot yo‘q', 'Tanlangan davrda barcha hisobotlar belgilangan.')}
          ${missing.length > 12 ? `<div class="table-footer"><span>Ko‘rsatilgan: 12 / ${missing.length}</span><button class="inline-link" data-action="go-reports">Qolganlarini ko‘rish →</button></div>` : ''}
        </div>
        <div class="panel"><div class="panel-head"><div><h2>Muddat nazorati</h2><p>Yaqin e’tibor talab qiladigan hisobotlar.</p></div><span class="stat-icon">◷</span></div><div class="deadline-list">${deadlineRows || emptyState('Hammasi joyida', 'Tanlangan davr uchun kutilayotgan hisobot yo‘q.', '✓')}</div></div>
      </section>`;
  }

  function renderOrganizations() {
    const term = state.search.trim().toLocaleLowerCase('uz-UZ');
    const orgs = state.organizations.filter(org => !term || [org.name, org.inn, org.director_name, org.phone].some(value => String(value || '').toLocaleLowerCase('uz-UZ').includes(term)));
    const rows = orgs.map(org => {
      const reports = state.reports.filter(report => report.organization_id === org.id && report.enabled).length;
      const keyButton = org.pfx_path
        ? `<button class="key-action" data-action="download-pfx" data-id="${org.id}" title="PFX faylini ushbu qurilmaga yuklab olish">↓ Yuklab olish</button>`
        : `<button class="key-action missing" data-action="upload-pfx" data-id="${org.id}" title="PFX faylini saytga saqlash">↑ PFX yuklash</button>`;
      const changeKey = org.pfx_path ? `<button class="table-action" data-action="upload-pfx" data-id="${org.id}" title="Kalitni almashtirish">Almashtirish</button>` : '';
      return `<tr>
        <td><div class="org-summary"><div class="org-avatar">${escapeHtml((org.name || '?').trim().slice(0, 1).toLocaleUpperCase('uz-UZ'))}</div><div><span class="cell-primary">${escapeHtml(org.name)}</span><span class="cell-secondary">${reports} ta hisobot turi</span></div></div></td>
        <td><span class="cell-primary">${escapeHtml(org.inn)}</span></td>
        <td>${escapeHtml(org.director_name || '—')}</td>
        <td>${escapeHtml(org.phone || '—')}</td>
        <td>${keyButton}<span class="cell-secondary">${org.pfx_filename ? escapeHtml(org.pfx_filename) : 'Fayl biriktirilmagan'}</span></td>
        <td><div class="action-row"><button class="table-action" data-action="edit-org" data-id="${org.id}">Tahrirlash</button>${changeKey}<button class="table-action danger" data-action="delete-org" data-id="${org.id}" title="Tashkilotni o‘chirish">×</button></div></td>
      </tr>`;
    });
    view.content.innerHTML = `
      <div class="page-intro"><div><p class="eyebrow">MA’LUMOTLAR BAZASI</p><h1>Tashkilotlar</h1><p>Tashkilot ma’lumotlari va PFX kalitlarini shu yerda boshqaring.</p></div><div class="intro-actions"><button class="btn btn-primary" data-action="add-org">＋ Tashkilot qo‘shish</button></div></div>
      <div class="panel"><div class="panel-head"><div><h2>Barcha tashkilotlar</h2><p>${state.organizations.length} ta tashkilot bazaga kiritilgan.</p></div><span class="status status-neutral">PFX kalitlari</span></div>
      <form id="orgSearchForm" class="filterbar"><label class="search-box"><span>⌕</span><input id="orgSearch" value="${escapeHtml(state.search)}" placeholder="Nom, STIR, direktor yoki telefon bo‘yicha qidirish"></label><button class="btn btn-light" type="submit">Qidirish</button><button class="btn btn-light" type="button" data-action="clear-org-search">Tozalash</button></form>
      ${tableShell(['Tashkilot nomi', 'INN / STIR', 'Direktor', 'Telefon', 'PFX kaliti', 'Amallar'], rows, 'Tashkilotlar hali qo‘shilmagan', '“Tashkilot qo‘shish” tugmasini bosib birinchi tashkilotni kiriting.')}
      <div class="table-footer"><span class="table-count">Ko‘rsatilgan: ${orgs.length} / ${state.organizations.length}</span><span>PFX tugmasi faylni shu qurilmaga yuklab beradi.</span></div></div>`;
  }

  function renderReports() {
    const rows = reportRows().sort((a, b) => a.organization.name.localeCompare(b.organization.name) || a.report.report_name.localeCompare(b.report.report_name));
    const tableRows = rows.map(({ organization, report, status }) => `<tr>
      <td><span class="cell-primary">${escapeHtml(organization.name)}</span><span class="cell-secondary">STIR: ${escapeHtml(organization.inn)}</span></td>
      <td><span class="cell-primary">${escapeHtml(report.report_name)}</span></td>
      <td>${escapeHtml(formatPeriod(state.period))}</td>
      <td><input class="date-input due-date-input" type="date" data-action="update-due-date" data-status-id="${status.id}" data-report-id="${report.id}" value="${escapeHtml(status.due_date)}" aria-label="Topshirish muddati"></td>
      <td>${statusBadge(status)}</td>
      <td><label class="report-status-cell"><input class="check-control" type="checkbox" data-action="toggle-report" data-status-id="${status.id}" ${status.submitted ? 'checked' : ''} aria-label="Hisobot topshirildi deb belgilash"><span>${status.submitted ? 'Belgilangan' : 'Topshirildi deb belgilash'}</span></label>${status.submitted_at ? `<span class="cell-secondary">Topshirilgan: ${formatDate(status.submitted_at)}</span>` : ''}</td>
    </tr>`);
    view.content.innerHTML = `
      <div class="page-intro"><div><p class="eyebrow">MUDDAT VA HOLAT</p><h1>Hisobotlar nazorati</h1><p>Har bir tashkilotning har bir hisobotini topshirganingizda belgilang.</p></div><div class="intro-actions"><span class="status status-neutral">${escapeHtml(formatPeriod(state.period))}</span></div></div>
      <div class="hint-box"><span>✦</span><div>“Topshirildi” katagiga belgi qo‘yilsa, sana avtomatik yoziladi. Belgini olib tashlasangiz, hisobot yana topshirilmagan holatga qaytadi. Muddatni har bir satrda o‘zgartirishingiz mumkin.</div></div>
      <div class="panel"><div class="panel-head"><div><h2>Hisobotlar ro‘yxati</h2><p>${rows.length} ta faol hisobot turi · Davr: ${escapeHtml(formatPeriod(state.period))}</p></div><button class="btn btn-light" data-action="reload-data">↻ Yangilash</button></div>
      ${tableShell(['Tashkilot', 'Soliq turi / hisobot', 'Hisobot davri', 'Topshirish muddati', 'Holat', 'Belgilash'], tableRows, 'Hisobot turlari belgilanmagan', 'Tashkilotlar bo‘limiga kirib, har bir tashkilot uchun topshiriladigan hisobotlarni tanlang.')}
      <div class="table-footer"><span>Hisobotlar faqat o‘zingiz belgilaganingizda topshirilgan deb hisoblanadi.</span><span class="table-count">${rows.filter(row => row.status.submitted).length} / ${rows.length} topshirilgan</span></div></div>`;
  }

  function renderFinance() {
    const activeOrgs = [...state.organizations].sort((a, b) => a.name.localeCompare(b.name));
    const rows = activeOrgs.map(org => {
      const financeRow = state.finances.find(row => row.organization_id === org.id && row.period_key === state.period);
      const monthlyDue = Number(financeRow?.amount_due ?? 0);
      const monthlyPaid = allPaymentTotal(org.id, state.period);
      const monthlyLeft = Math.max(0, monthlyDue - monthlyPaid);
      const totalDebt = outstandingForOrg(org.id);
      const paymentState = monthlyDue <= 0 ? { label: 'Summa belgilanmagan', cls: 'status-neutral' } : monthlyLeft <= 0 ? { label: 'To‘langan', cls: 'status-success' } : monthlyPaid > 0 ? { label: 'Qisman', cls: 'status-warning' } : { label: 'To‘lanmagan', cls: 'status-danger' };
      return `<tr>
        <td><span class="cell-primary">${escapeHtml(org.name)}</span><span class="cell-secondary">STIR: ${escapeHtml(org.inn)}</span></td>
        <td class="finance-cell-amount">${formatMoney(monthlyDue)}</td>
        <td>${formatMoney(monthlyPaid)}<span class="cell-secondary">${paymentState.label}</span></td>
        <td><span class="status ${paymentState.cls}">${escapeHtml(paymentState.label)}</span></td>
        <td>${totalDebt > 0 ? `<span class="debt-amount">${formatMoney(totalDebt)}</span>` : `<span class="debt-zero">0 so‘m</span>`}</td>
        <td><div class="action-row"><button class="table-action primary" data-action="add-payment" data-id="${org.id}">＋ To‘lov</button><button class="table-action" data-action="payment-history" data-id="${org.id}">Tarix</button></div></td>
      </tr>`;
    });
    const totalDueThisMonth = dueTotal(null, state.period);
    const totalPaidThisMonth = allPaymentTotal(null, state.period);
    const totalDebt = Math.max(0, dueTotal() - allPaymentTotal());
    const debtors = activeOrgs.filter(org => outstandingForOrg(org.id) > 0).length;
    view.content.innerHTML = `
      <div class="page-intro"><div><p class="eyebrow">TO‘LOVLAR VA QARZDORLIK</p><h1>Moliyaviy holat</h1><p>Oylik xizmat haqlari, tushgan to‘lovlar va yig‘ilgan qarzlar.</p></div><div class="intro-actions"><button class="btn btn-light" data-action="reload-data">↻ Yangilash</button></div></div>
      <section class="finance-summary">
        ${statCard('Jami qarzdorlik', formatMoney(totalDebt), '₿', `${debtors} ta tashkilotda qarz bor`, 'danger')}
        ${statCard('Tanlangan oyda olinishi kerak', formatMoney(totalDueThisMonth), '↗', escapeHtml(formatPeriod(state.period)), 'accent')}
        ${statCard('Tanlangan oyda tushgan', formatMoney(totalPaidThisMonth), '✓', 'Kiritilgan to‘lovlar yig‘indisi', 'success')}
      </section>
      <div class="hint-box"><span>✦</span><div>Qarz avtomatik hisoblanadi: tanlangan va oldingi oylar uchun xizmat haqi minus kiritilgan to‘lovlar. Tashkilotning “Hisob-kitob boshlanish oyi” moliyaviy davr qaysi oydan boshlanishini belgilaydi.</div></div>
      <div class="panel"><div class="panel-head"><div><h2>Tashkilotlar bo‘yicha to‘lovlar</h2><p>${escapeHtml(formatPeriod(state.period))} oyi uchun hisob-kitob.</p></div><span class="status status-neutral">${activeOrgs.length} ta tashkilot</span></div>
      ${tableShell(['Tashkilot', 'Oylik xizmat haqi', 'Shu oy to‘langan', 'Shu oy holati', 'Jami qarz', 'Amallar'], rows, 'Tashkilotlar yo‘q', 'Avval tashkilotlar bo‘limiga tashkilot qo‘shing.')}
      <div class="table-footer"><span>To‘lovni to‘liq yoki qisman kiritish mumkin.</span><span class="table-count">Jami qarzdorlik: <strong>${formatMoney(totalDebt)}</strong></span></div></div>`;
  }

  function openOrgDialog(org = null) {
    view.orgForm.reset();
    clearFormError($('#orgFormError'));
    $('#orgId').value = org?.id || '';
    $('#orgDialogTitle').textContent = org ? 'Tashkilotni tahrirlash' : 'Yangi tashkilot';
    $('#orgName').value = org?.name || '';
    $('#orgInn').value = org?.inn || '';
    $('#orgDirector').value = org?.director_name || '';
    $('#orgPhone').value = org?.phone || '';
    $('#orgFee').value = String(org?.monthly_fee ?? 0);
    $('#orgBillingStart').value = org?.billing_start_period || currentMonthKey();
    const existing = state.reports.filter(report => report.organization_id === org?.id && report.enabled).map(report => report.report_name);
    $$('#reportChoices input[name="reportChoice"]').forEach(input => { input.checked = existing.includes(input.value); });
    const standard = new Set($$('#reportChoices input[name="reportChoice"]').map(input => input.value));
    $('#customReports').value = existing.filter(name => !standard.has(name)).join(', ');
    view.orgDialog.showModal();
  }

  async function saveOrganization(event) {
    event.preventDefault();
    const errorNode = $('#orgFormError');
    clearFormError(errorNode);
    const saveBtn = $('#saveOrgBtn');
    const oldText = saveBtn.textContent;
    saveBtn.disabled = true; saveBtn.textContent = 'Saqlanmoqda...';
    try {
      const id = $('#orgId').value || null;
      const name = $('#orgName').value.trim();
      const inn = $('#orgInn').value.trim();
      const director_name = $('#orgDirector').value.trim();
      const phone = $('#orgPhone').value.trim();
      const monthly_fee = Number($('#orgFee').value || 0);
      const billing_start_period = $('#orgBillingStart').value || currentMonthKey();
      if (!name || !inn) throw new Error('Tashkilot nomi va INN majburiy.');
      if (!Number.isFinite(monthly_fee) || monthly_fee < 0) throw new Error('Oylik xizmat haqi 0 yoki undan katta bo‘lishi kerak.');
      const payload = { owner_id: state.user.id, name, inn, director_name, phone, monthly_fee, billing_start_period };
      let organization;
      if (id) {
        organization = requireResult(await state.client.from('organizations').update(payload).eq('id', id).select('*').single(), 'Tashkilotni saqlash');
      } else {
        organization = requireResult(await state.client.from('organizations').insert(payload).select('*').single(), 'Tashkilotni qo‘shish');
      }
      const checkedNames = $$('#reportChoices input[name="reportChoice"]:checked').map(input => input.value);
      const customNames = $('#customReports').value.split(',').map(name => name.trim()).filter(Boolean);
      const reportNames = [...new Set([...checkedNames, ...customNames])];
      const oldReports = state.reports.filter(report => report.organization_id === organization.id);
      for (const old of oldReports) {
        if (!reportNames.includes(old.report_name) && old.enabled) {
          requireResult(await state.client.from('organization_reports').update({ enabled: false }).eq('id', old.id), 'Hisobot turini o‘chirish');
        }
      }
      for (const reportName of reportNames) {
        const prior = oldReports.find(report => report.report_name === reportName);
        if (prior) {
          requireResult(await state.client.from('organization_reports').update({ enabled: true }).eq('id', prior.id), 'Hisobot turini yangilash');
        } else {
          requireResult(await state.client.from('organization_reports').insert({ owner_id: state.user.id, organization_id: organization.id, report_name: reportName, deadline_day: 15, enabled: true }), 'Hisobot turini qo‘shish');
        }
      }
      // Oylik narx o‘zgarganda, joriy oyning majburiyati hali to‘lov kiritilmagan bo‘lsa yangilansin.
      const currentFinance = state.finances.find(row => row.organization_id === organization.id && row.period_key === currentMonthKey());
      if (currentFinance) {
        const paidCurrent = allPaymentTotal(organization.id, currentMonthKey());
        if (paidCurrent === 0) requireResult(await state.client.from('monthly_finances').update({ amount_due: monthly_fee }).eq('id', currentFinance.id), 'Joriy oylik summani yangilash');
      }
      view.orgDialog.close();
      showToast(id ? 'Tashkilot ma’lumotlari saqlandi.' : 'Tashkilot qo‘shildi.');
      await refreshData();
    } catch (error) {
      console.error(error);
      showFormError(errorNode, friendlyError(error));
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = oldText;
    }
  }

  async function deleteOrganization(orgId) {
    const org = getOrg(orgId);
    if (!org) return;
    if (!window.confirm(`“${org.name}” tashkilotini o‘chirasizmi? Uning hisobotlari, moliyaviy yozuvlari va saqlangan PFX fayli ham o‘chadi.`)) return;
    try {
      if (org.pfx_path) {
        const { error: storageError } = await state.client.storage.from('pfx-keys').remove([org.pfx_path]);
        if (storageError) console.warn('PFX faylni o‘chirishda xatolik:', storageError.message);
      }
      requireResult(await state.client.from('organizations').delete().eq('id', orgId), 'Tashkilotni o‘chirish');
      showToast('Tashkilot o‘chirildi.');
      await refreshData();
    } catch (error) {
      console.error(error); showToast(friendlyError(error), 'error');
    }
  }

  function safeFileName(name) {
    const cleaned = String(name || 'kalit.pfx').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100);
    return cleaned || 'kalit.pfx';
  }
  async function uploadPfx(orgId, file) {
    const org = getOrg(orgId);
    if (!org || !file) return;
    if (!/\.(pfx|p12)$/i.test(file.name)) { showToast('Faqat .pfx yoki .p12 faylini tanlang.', 'error'); return; }
    if (file.size > 20 * 1024 * 1024) { showToast('Fayl hajmi 20 MB dan oshmasligi kerak.', 'error'); return; }
    showToast('PFX fayli yuklanmoqda...', 'warn');
    const path = `${state.user.id}/${org.id}/${Date.now()}_${safeFileName(file.name)}`;
    try {
      const { error: uploadError } = await state.client.storage.from('pfx-keys').upload(path, file, { cacheControl: '0', upsert: false, contentType: 'application/x-pkcs12' });
      if (uploadError) throw uploadError;
      const { error: updateError } = await state.client.from('organizations').update({ pfx_path: path, pfx_filename: file.name }).eq('id', org.id);
      if (updateError) {
        await state.client.storage.from('pfx-keys').remove([path]);
        throw updateError;
      }
      if (org.pfx_path && org.pfx_path !== path) {
        const { error: removeOldError } = await state.client.storage.from('pfx-keys').remove([org.pfx_path]);
        if (removeOldError) console.warn('Oldingi PFX o‘chirilmadi:', removeOldError.message);
      }
      showToast(`${org.name} uchun PFX fayli saqlandi.`);
      await refreshData();
    } catch (error) {
      console.error(error); showToast(`PFX yuklanmadi: ${friendlyError(error)}`, 'error');
    } finally {
      $('#pfxFileInput').value = '';
      state.pendingPfxOrganizationId = null;
    }
  }
  async function downloadPfx(orgId) {
    const org = getOrg(orgId);
    if (!org?.pfx_path) { showToast('Bu tashkilot uchun PFX fayli yuklanmagan.', 'warn'); return; }
    try {
      const { data, error } = await state.client.storage.from('pfx-keys').download(org.pfx_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = org.pfx_filename || `${safeFileName(org.name)}.pfx`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast('PFX fayli ushbu qurilmaga yuklandi.');
    } catch (error) {
      console.error(error); showToast(`Faylni yuklab bo‘lmadi: ${friendlyError(error)}`, 'error');
    }
  }

  async function toggleReport(statusId, checked) {
    try {
      const payload = { submitted: checked, submitted_at: checked ? new Date().toISOString() : null };
      requireResult(await state.client.from('report_statuses').update(payload).eq('id', statusId), 'Hisobot holatini saqlash');
      showToast(checked ? 'Hisobot topshirilgan deb belgilandi.' : 'Hisobot topshirilmagan holatga qaytarildi.');
      await refreshData();
    } catch (error) {
      console.error(error); showToast(friendlyError(error), 'error'); await refreshData();
    }
  }
  async function updateDueDate(statusId, reportId, value) {
    if (!value) return;
    try {
      requireResult(await state.client.from('report_statuses').update({ due_date: value }).eq('id', statusId), 'Topshirish muddatini saqlash');
      const day = Number(value.slice(-2));
      requireResult(await state.client.from('organization_reports').update({ deadline_day: day }).eq('id', reportId), 'Standart muddatni saqlash');
      showToast('Topshirish muddati saqlandi. Keyingi davr uchun ham shu kun qo‘llanadi.');
      await refreshData();
    } catch (error) {
      console.error(error); showToast(friendlyError(error), 'error'); await refreshData();
    }
  }

  function openPaymentDialog(orgId) {
    const org = getOrg(orgId);
    if (!org) return;
    view.paymentForm.reset();
    clearFormError($('#paymentFormError'));
    $('#paymentOrgId').value = org.id;
    $('#paymentPeriod').value = state.period;
    $('#paymentOrgName').textContent = `${org.name} · ${formatPeriod(state.period)}`;
    $('#paymentAmount').value = '';
    $('#paymentDate').value = todayIso();
    $('#paymentNote').value = '';
    view.paymentDialog.showModal();
  }
  async function savePayment(event) {
    event.preventDefault();
    const errorNode = $('#paymentFormError'); clearFormError(errorNode);
    const button = $('button[type="submit"]', view.paymentForm);
    const oldLabel = button.textContent; button.disabled = true; button.textContent = 'Saqlanmoqda...';
    try {
      const organization_id = $('#paymentOrgId').value;
      const amount = Number($('#paymentAmount').value);
      const paid_at = $('#paymentDate').value;
      const period_key = $('#paymentPeriod').value;
      const note = $('#paymentNote').value.trim();
      if (!organization_id || !Number.isFinite(amount) || amount <= 0 || !paid_at) throw new Error('To‘lov summasi va sanasini to‘g‘ri kiriting.');
      requireResult(await state.client.from('payments').insert({ owner_id: state.user.id, organization_id, period_key, amount, paid_at, note }), 'To‘lovni saqlash');
      view.paymentDialog.close();
      showToast('To‘lov saqlandi, qarzdorlik qayta hisoblandi.');
      await refreshData();
    } catch (error) {
      console.error(error); showFormError(errorNode, friendlyError(error));
    } finally { button.disabled = false; button.textContent = oldLabel; }
  }
  function openPaymentHistory(orgId) {
    const org = getOrg(orgId); if (!org) return;
    $('#historyTitle').textContent = `${org.name} — to‘lovlar tarixi`;
    const payments = state.payments.filter(payment => payment.organization_id === orgId).sort((a, b) => b.paid_at.localeCompare(a.paid_at));
    const rows = payments.map(payment => `<div class="history-row"><div><strong>${escapeHtml(formatPeriod(payment.period_key))}</strong><span>${formatDate(payment.paid_at)}${payment.note ? ` · ${escapeHtml(payment.note)}` : ''}</span><button class="inline-link" data-action="delete-payment" data-id="${payment.id}">To‘lovni o‘chirish</button></div><b class="paid">+ ${formatMoney(payment.amount)}</b></div>`).join('');
    const debtByPeriod = state.finances.filter(row => row.organization_id === orgId).sort((a, b) => b.period_key.localeCompare(a.period_key)).map(finance => {
      const paid = allPaymentTotal(orgId, finance.period_key);
      return `<div class="history-row"><div><strong>${escapeHtml(formatPeriod(finance.period_key))} — oylik xizmat haqi</strong><span>Hisoblangan summa: ${formatMoney(finance.amount_due)} · To‘langan: ${formatMoney(paid)}</span></div><b class="${Math.max(0, Number(finance.amount_due) - paid) > 0 ? 'unpaid' : 'paid'}">Qarz: ${formatMoney(Math.max(0, Number(finance.amount_due) - paid))}</b></div>`;
    }).join('');
    $('#historyContent').innerHTML = `${emptyOrBlank(payments.length ? '' : emptyState('To‘lovlar hali kiritilmagan', '“To‘lov” tugmasi orqali tushgan summani kiriting.', '₿'))}<h3>To‘lovlar</h3>${rows || '<p class="muted small">Hozircha to‘lov yozuvi yo‘q.</p>'}<div class="subtle-divider"></div><h3>Oylar bo‘yicha hisob</h3>${debtByPeriod || '<p class="muted small">Moliyaviy davr yaratilmagan.</p>'}`;
    if (!view.historyDialog.open) view.historyDialog.showModal();
  }
  function emptyOrBlank(value) { return value || ''; }
  async function deletePayment(paymentId) {
    if (!window.confirm('Ushbu to‘lov yozuvini o‘chirishni tasdiqlaysizmi? Qarzdorlik qayta hisoblanadi.')) return;
    try {
      requireResult(await state.client.from('payments').delete().eq('id', paymentId), 'To‘lov yozuvini o‘chirish');
      showToast('To‘lov yozuvi o‘chirildi.');
      await refreshData();
      const currentOrg = state.organizations.find(org => $('#historyTitle').textContent.startsWith(org.name));
      if (currentOrg) openPaymentHistory(currentOrg.id); else view.historyDialog.close();
    } catch (error) { console.error(error); showToast(friendlyError(error), 'error'); }
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    const id = button.dataset.id;
    if (action === 'add-org') openOrgDialog();
    else if (action === 'edit-org') openOrgDialog(getOrg(id));
    else if (action === 'delete-org') await deleteOrganization(id);
    else if (action === 'upload-pfx') {
      state.pendingPfxOrganizationId = id;
      $('#pfxFileInput').click();
    }
    else if (action === 'download-pfx') await downloadPfx(id);
    else if (action === 'go-reports') setTab('reports');
    else if (action === 'reload-data') {
      button.disabled = true;
      try { await refreshData(true); showToast('Ma’lumotlar yangilandi.'); }
      catch (error) { console.error(error); showToast(friendlyError(error), 'error'); }
      finally { button.disabled = false; }
    }
    else if (action === 'clear-org-search') { state.search = ''; renderOrganizations(); }
    else if (action === 'add-payment') openPaymentDialog(id);
    else if (action === 'payment-history') openPaymentHistory(id);
    else if (action === 'delete-payment') await deletePayment(id);
  }

  function attachEvents() {
    view.loginForm.addEventListener('submit', async event => {
      event.preventDefault(); clearFormError(view.loginError);
      const button = $('button[type="submit"]', view.loginForm);
      button.disabled = true; button.textContent = 'Kirilmoqda...';
      try {
        const email = $('#loginEmail').value.trim();
        const password = $('#loginPassword').value;
        const { data, error } = await state.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await handleSession(data.session);
      } catch (error) { console.error(error); showFormError(view.loginError, friendlyError(error)); }
      finally { button.disabled = false; button.innerHTML = 'Tizimga kirish <span aria-hidden="true">→</span>'; }
    });
    $('#logoutBtn').addEventListener('click', async () => {
      const { error } = await state.client.auth.signOut();
      if (error) showToast(friendlyError(error), 'error');
      state.lastUserId = null; state.user = null; showAuth();
    });
    view.period.addEventListener('change', async () => {
      if (!view.period.value) return;
      state.period = view.period.value;
      try { await refreshData(true); }
      catch (error) { console.error(error); showToast(friendlyError(error), 'error'); }
    });
    view.orgForm.addEventListener('submit', saveOrganization);
    view.paymentForm.addEventListener('submit', savePayment);
    $('#pfxFileInput').addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (file && state.pendingPfxOrganizationId) uploadPfx(state.pendingPfxOrganizationId, file);
    });
    $('#mobileMenuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $$('.nav-item').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
    document.addEventListener('click', async event => {
      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) { const dialog = document.getElementById(closeButton.dataset.closeDialog); if (dialog?.open) dialog.close(); return; }
      const button = event.target.closest('[data-action]');
      if (!button || button.classList.contains('check-control') || button.classList.contains('due-date-input')) return;
      await handleAction(button);
    });
    document.addEventListener('change', async event => {
      const target = event.target;
      if (target.matches('.check-control[data-action="toggle-report"]')) await toggleReport(target.dataset.statusId, target.checked);
      if (target.matches('.due-date-input[data-action="update-due-date"]')) await updateDueDate(target.dataset.statusId, target.dataset.reportId, target.value);
    });
    document.addEventListener('submit', event => {
      if (event.target.id === 'orgSearchForm') {
        event.preventDefault(); state.search = $('#orgSearch')?.value || ''; renderOrganizations();
      }
    });
    // Escape bosilsa mobil menyu yopiladi.
    document.addEventListener('keydown', event => { if (event.key === 'Escape') $('#sidebar').classList.remove('open'); });
  }

  async function boot() {
    attachEvents();
    $('#yearNow').textContent = new Date().getFullYear();
    view.period.value = state.period;
    const url = String(CONFIG.SUPABASE_URL || '').trim();
    const key = String(CONFIG.SUPABASE_ANON_KEY || '').trim();
    const notConfigured = !url || !key || /HERE|YOUR_|PASTE_/i.test(url) || /HERE|YOUR_|PASTE_/i.test(key);
    if (notConfigured) { showSetup(); return; }
    if (!window.supabase?.createClient) {
      view.setup.classList.remove('hidden');
      view.setup.querySelector('.setup-card').insertAdjacentHTML('beforeend', '<p class="warning-note">Supabase JavaScript kutubxonasi yuklanmadi. Internet ulanishi va CDN manzilini tekshiring.</p>');
      return;
    }
    state.client = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    state.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') handleSession(null);
      else if (session?.user && state.lastUserId !== session.user.id) handleSession(session);
    });
    const { data, error } = await state.client.auth.getSession();
    if (error) { showAuth(); showFormError(view.loginError, friendlyError(error)); return; }
    await handleSession(data.session);
  }

  document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
