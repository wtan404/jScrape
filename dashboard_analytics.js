/**
 * Application Funnel & Pipeline Analytics Controller
 * Dedicated Sankey & Conversion Intelligence Engine
 */

let applicationsMap = {};
let isGoogleChartsReady = false;
let googleChartsPromise = null;

document.addEventListener('DOMContentLoaded', () => {
  initAnalyticsDashboard();
});

async function initAnalyticsDashboard() {
  if (window.lucide) lucide.createIcons();

  // 1. Initial optimistic load from localStorage
  loadLocalApplications();

  // 2. Fetch live applications state from server
  await fetchServerApplications();

  // 3. Run automated 20-day inactivity aging
  applyTwentyDayAutoAging();

  // 4. Render KPIs & Ledger Table
  renderKpiMetrics();
  renderAnalyticsTable();

  // 5. Initialize & Draw Sankey Funnel
  ensureGoogleCharts().then(() => {
    renderSankeyFunnel();
  }).catch(err => {
    console.warn('Google Charts initialization warning:', err);
    renderFallbackFunnel();
  });

  window.addEventListener('resize', debounce(() => {
    if (isGoogleChartsReady) renderSankeyFunnel();
  }, 250));
}

function loadLocalApplications() {
  try {
    const raw = localStorage.getItem('scrapedeez_job_applications');
    if (raw) {
      const parsed = JSON.parse(raw);
      applicationsMap = parsed.applied || {};
    }
  } catch (e) {
    console.warn('Could not read local applications:', e.message);
  }
}

async function fetchServerApplications() {
  try {
    const res = await fetch(`./api.php?action=summary&t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.applied) {
        // Merge server state
        applicationsMap = { ...applicationsMap, ...data.applied };
        saveLocalApplications();
      }
    }
  } catch (e) {
    // If running in subfolder /dashboard/, try parent api.php
    try {
      const parentRes = await fetch(`../api.php?action=summary&t=${Date.now()}`);
      if (parentRes.ok) {
        const data = await parentRes.json();
        if (data && data.applied) {
          applicationsMap = { ...applicationsMap, ...data.applied };
          saveLocalApplications();
        }
      }
    } catch (e2) {}
  }
}

function saveLocalApplications() {
  try {
    const raw = localStorage.getItem('scrapedeez_job_applications') || '{}';
    const parsed = JSON.parse(raw);
    parsed.applied = applicationsMap;
    localStorage.setItem('scrapedeez_job_applications', JSON.stringify(parsed));
  } catch (e) {}
}

function applyTwentyDayAutoAging() {
  const now = Date.now();
  const TWENTY_DAYS_MS = 20 * 24 * 60 * 60 * 1000;
  let didChange = false;

  Object.entries(applicationsMap).forEach(([key, item]) => {
    if (!item || !item.status) return;

    // Check if job is still in Applied status
    if (item.status === 'Applied') {
      const dateStr = item.appliedAt || item.date || item.updatedAt;
      if (dateStr) {
        const appliedTime = new Date(dateStr).getTime();
        if (now - appliedTime >= TWENTY_DAYS_MS) {
          item.status = 'No Response';
          item.rejectionStage = 'no_response';
          item.updatedAt = new Date().toISOString();
          item.stageHistory = item.stageHistory || [];
          item.stageHistory.push({
            stage: 'No Response',
            timestamp: item.updatedAt,
            note: 'Auto-transitioned after 20 days of inactivity'
          });
          didChange = true;
          persistApplicationUpdate(key, item);
        }
      }
    }
  });

  if (didChange) {
    saveLocalApplications();
  }
}

async function persistApplicationUpdate(key, item) {
  try {
    const payload = {
      jobId: key,
      status: item.status,
      rejectionStage: item.rejectionStage || '',
      resumeId: item.resumeId || '',
      resumeLabel: item.resumeLabel || '',
      notes: item.notes || '',
      stageHistory: item.stageHistory || []
    };

    // Try relative paths
    const endpoints = ['./api.php?action=update_application_status', '../api.php?action=update_application_status'];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) break;
      } catch (err) {}
    }
  } catch (err) {
    console.warn('Persist application status warning:', err.message);
  }
}

function ensureGoogleCharts() {
  if (isGoogleChartsReady && window.google?.visualization?.Sankey) {
    return Promise.resolve(true);
  }
  if (typeof google === 'undefined') {
    return Promise.reject(new Error('Google Charts loader not available'));
  }
  if (!googleChartsPromise) {
    googleChartsPromise = new Promise((resolve, reject) => {
      try {
        google.charts.load('current', { packages: ['sankey'] });
        google.charts.setOnLoadCallback(() => {
          isGoogleChartsReady = true;
          resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });
  }
  return googleChartsPromise;
}

function cleanSource(src) {
  if (!src) return 'Direct / Other';
  if (src.includes('Greenhouse')) return 'Greenhouse Direct';
  if (src.includes('Lever')) return 'Lever Direct';
  if (src.includes('Ashby')) return 'Ashby Direct';
  if (src.includes('LinkedIn')) return 'LinkedIn';
  if (src.includes('WeWorkRemotely')) return 'WeWorkRemotely';
  if (src.includes('Jobicy')) return 'Jobicy';
  if (src.includes('RemoteOK')) return 'RemoteOK';
  if (src.includes('Remotive')) return 'Remotive';
  return src.replace(/\s*\(.*\)/, '').trim() || 'Direct / Other';
}

function cleanResume(label) {
  if (!label || label === 'Default Resume') return 'Corporate / IT Lead';
  return label.replace(' & Operations', '').trim();
}

function renderKpiMetrics() {
  const items = Object.values(applicationsMap);
  const total = items.length;

  let appliedCount = 0;
  let inReviewCount = 0;
  let interviewingCount = 0;
  let offerCount = 0;
  let noResponseCount = 0;
  let rejectedCount = 0;

  items.forEach(item => {
    const s = item.status || 'Applied';
    if (s === 'Applied') appliedCount++;
    else if (s === 'In Review') inReviewCount++;
    else if (s === 'Interviewing') interviewingCount++;
    else if (s === 'Offer' || s === 'Offer Extended') offerCount++;
    else if (s === 'No Response' || s === 'Archived') noResponseCount++;
    else if (s.startsWith('Rejected')) rejectedCount++;
  });

  // Effective Total Rejected includes direct, post-review, post-interview, and aged No Response
  const totalEffectiveRejected = rejectedCount + noResponseCount;

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiApplied').textContent = appliedCount;
  document.getElementById('kpiInReview').textContent = inReviewCount;
  document.getElementById('kpiInterviewing').textContent = interviewingCount;
  document.getElementById('kpiOffer').textContent = offerCount;
  document.getElementById('kpiNoResponse').textContent = noResponseCount;
  document.getElementById('kpiRejected').textContent = totalEffectiveRejected;
}

function buildSankeyEdges() {
  const items = Object.values(applicationsMap);
  if (!items.length) return [];

  const edgeWeights = {};

  function addEdge(from, to, weight = 1) {
    if (!from || !to || from === to) return;
    const key = `${from}:::${to}`;
    edgeWeights[key] = (edgeWeights[key] || 0) + weight;
  }

  items.forEach(item => {
    const source = cleanSource(item.job?.source);
    const scope = cleanResume(item.resumeLabel);
    const status = item.status || 'Applied';
    const rejStage = item.rejectionStage || (status.includes(':') ? status.split(':')[1].trim().toLowerCase() : 'direct');

    // Step 1 -> Step 2 (Always present for applied jobs)
    addEdge(source, scope, 1);

    // Progression rules based on response:
    if (status === 'Applied') {
      // "if theres no responses but the status is still 'applied', do not progress past step 2."
      // Stops at Step 2 (scope node)
      return;
    }

    if (status === 'In Review') {
      addEdge(scope, '🟣 In Review', 1);
      return;
    }

    if (status === 'Interviewing') {
      addEdge(scope, '🟣 In Review', 1);
      addEdge('🟣 In Review', '🔵 Interviewing', 1);
      return;
    }

    if (status === 'Offer' || status === 'Offer Extended') {
      addEdge(scope, '🟣 In Review', 1);
      addEdge('🟣 In Review', '🔵 Interviewing', 1);
      addEdge('🔵 Interviewing', '⭐ Offer Extended', 1);
      return;
    }

    if (status === 'No Response' || status === 'Archived') {
      // Step 3: No Response -> Rejected
      addEdge(scope, '⚪ No Response', 1);
      addEdge('⚪ No Response', '🔴 Rejected', 1);
      return;
    }

    if (status.startsWith('Rejected')) {
      if (rejStage === 'post_interview' || status.includes('Post-Interview')) {
        addEdge(scope, '🟣 In Review', 1);
        addEdge('🟣 In Review', '🔵 Interviewing', 1);
        addEdge('🔵 Interviewing', '🔴 Rejected', 1);
      } else if (rejStage === 'post_review' || status.includes('Post-Review')) {
        addEdge(scope, '🟣 In Review', 1);
        addEdge('🟣 In Review', '🔴 Rejected', 1);
      } else if (rejStage === 'no_response' || status.includes('No Response')) {
        addEdge(scope, '⚪ No Response', 1);
        addEdge('⚪ No Response', '🔴 Rejected', 1);
      } else {
        // Direct rejection upfront
        addEdge(scope, '🔴 Rejected', 1);
      }
    }
  });

  return Object.entries(edgeWeights).map(([key, weight]) => {
    const [from, to] = key.split(':::');
    return [from, to, weight];
  });
}

function renderSankeyFunnel() {
  const container = document.getElementById('sankeyChartContainer');
  if (!container) return;

  const edges = buildSankeyEdges();

  if (!edges.length) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 380px; color: var(--text-dim); text-align: center; padding: 2rem;">
        <i data-lucide="git-commit" style="width: 32px; height: 32px; color: var(--accent-purple-light); opacity: 0.5; margin-bottom: 0.5rem;"></i>
        <div style="font-size: 0.92rem; font-weight: 700; color: var(--text-main);">No Application Flow Data</div>
        <div style="font-size: 0.75rem; max-width: 380px; margin-top: 0.25rem;">
          Track applications in the Triage Center to generate your conversion topology.
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const data = new google.visualization.DataTable();
  data.addColumn('string', 'From');
  data.addColumn('string', 'To');
  data.addColumn('number', 'Weight');
  data.addRows(edges);

  const colors = [
    '#818cf8', '#a855f7', '#c084fc', '#38bdf8', '#f59e0b',
    '#64748b', '#ef4444', '#ec4899', '#10b981', '#06b6d4'
  ];

  const chartHeight = Math.max(380, Math.min(600, edges.length * 28 + 120));

  // Determine container bounds and reserve space on the right (140px) for terminal node labels (⭐ Offer Extended, 🔴 Rejected).
  // Google Charts Sankey renders the rightmost node column at x = width - nodeWidth and places labels to the right of that node.
  // Reserving 140px ensures labels never clip the container or push beyond viewport bounds.
  const containerWidth = container.clientWidth || container.parentElement?.clientWidth || 1100;
  const chartWidth = Math.max(340, containerWidth - 140);

  const options = {
    width: chartWidth,
    height: chartHeight,
    sankey: {
      node: {
        colors: colors,
        label: {
          fontName: 'Inter, system-ui, sans-serif',
          fontSize: 11,
          color: '#f8fafc',
          bold: true
        },
        nodePadding: 24,
        width: 14,
        labelPadding: 10
      },
      link: {
        colorMode: 'gradient',
        colors: colors
      }
    },
    backgroundColor: 'transparent'
  };

  container.innerHTML = '';
  const chart = new google.visualization.Sankey(container);
  chart.draw(data, options);
}

function renderFallbackFunnel() {
  const container = document.getElementById('sankeyChartContainer');
  if (!container) return;
  const edges = buildSankeyEdges();

  let rowsHtml = edges.map(([from, to, count]) => `
    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.76rem;">
      <td style="padding: 0.5rem 0.75rem; color: var(--accent-purple-light); font-weight: 600;">${from}</td>
      <td style="padding: 0.5rem 0.75rem; text-align: center; color: var(--text-dim);">&rarr;</td>
      <td style="padding: 0.5rem 0.75rem; color: var(--text-main); font-weight: 600;">${to}</td>
      <td style="padding: 0.5rem 0.75rem; text-align: right; color: var(--accent-emerald); font-weight: 700;">${count}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div style="padding: 1.25rem;">
      <div style="font-size: 0.74rem; color: var(--text-dim); margin-bottom: 0.75rem;">
        <i>Notice: Google Charts offline fallback topology matrix</i>
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.72rem; color: var(--text-dim); text-align: left;">
            <th style="padding: 0.5rem 0.75rem;">Origin Node</th>
            <th style="padding: 0.5rem 0.75rem; text-align: center;">Flow</th>
            <th style="padding: 0.5rem 0.75rem;">Target Node</th>
            <th style="padding: 0.5rem 0.75rem; text-align: right;">Applications</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function renderAnalyticsTable() {
  const tbody = document.getElementById('analyticsTableBody');
  if (!tbody) return;

  const searchVal = document.getElementById('analyticsTableSearch')?.value.toLowerCase().trim() || '';
  let items = Object.entries(applicationsMap);

  if (searchVal) {
    items = items.filter(([k, item]) => {
      const j = item.job || {};
      const text = `${j.title || ''} ${j.company || ''} ${item.status || ''} ${item.resumeLabel || ''} ${j.source || ''}`.toLowerCase();
      return text.includes(searchVal);
    });
  }

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
          No matching application records found.
        </td>
      </tr>
    `;
    return;
  }

  // Sort by applied date descending
  items.sort((a, b) => {
    const da = new Date(a[1].appliedAt || a[1].date || 0).getTime();
    const db = new Date(b[1].appliedAt || b[1].date || 0).getTime();
    return db - da;
  });

  const now = Date.now();

  tbody.innerHTML = items.map(([key, item]) => {
    const j = item.job || {};
    const company = j.company || 'Direct Employer';
    const title = j.title || 'Tracked Position';
    const source = cleanSource(j.source);
    const resume = cleanResume(item.resumeLabel);
    const dateStr = item.appliedAt || item.date || '';
    const dateFormatted = dateStr ? new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    
    const ageDays = dateStr ? Math.floor((now - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const ageLabel = ageDays >= 20 ? `<span style="color: var(--accent-red); font-weight: 700;">${ageDays}d (Aged)</span>` : `<span style="color: var(--text-dim);">${ageDays}d</span>`;

    const currentStatus = item.status || 'Applied';
    const rejStage = item.rejectionStage || '';

    // Determine selected option in granular dropdown
    let selectedVal = currentStatus;
    if (currentStatus === 'Rejected') {
      if (rejStage === 'post_interview') selectedVal = 'Rejected: Post-Interview';
      else if (rejStage === 'post_review') selectedVal = 'Rejected: Post-Review';
      else if (rejStage === 'no_response') selectedVal = 'No Response';
      else selectedVal = 'Rejected: Direct';
    } else if (currentStatus === 'Archived') {
      selectedVal = 'No Response';
    }

    return `
      <tr>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(company)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(title)}</div>
        </td>
        <td>
          <span class="badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-main); font-size: 0.72rem; padding: 2px 7px; border-radius: 4px;">
            ${escapeHtml(source)}
          </span>
        </td>
        <td>
          <span style="font-size: 0.76rem; color: var(--text-dim);"><i data-lucide="file-text" style="width: 12px; height: 12px; vertical-align: middle;"></i> ${escapeHtml(resume)}</span>
        </td>
        <td style="font-size: 0.76rem; color: var(--text-dim);">${dateFormatted}</td>
        <td style="font-size: 0.76rem;">${ageLabel}</td>
        <td>
          <select class="status-select-badge" onchange="updateLedgerStatus('${escapeHtml(key)}', this.value)">
            <optgroup label="Active Funnel">
              <option value="Applied" ${selectedVal === 'Applied' ? 'selected' : ''}>🟢 Applied (Awaiting Response)</option>
              <option value="In Review" ${selectedVal === 'In Review' ? 'selected' : ''}>🟣 In Review</option>
              <option value="Interviewing" ${selectedVal === 'Interviewing' ? 'selected' : ''}>🔵 Interviewing</option>
              <option value="Offer" ${selectedVal === 'Offer' ? 'selected' : ''}>⭐ Offer Extended</option>
            </optgroup>
            <optgroup label="Terminal Exits">
              <option value="No Response" ${selectedVal === 'No Response' ? 'selected' : ''}>⚪ No Response (>20d)</option>
              <option value="Rejected: Direct" ${selectedVal === 'Rejected: Direct' ? 'selected' : ''}>🔴 Rejected: Direct (Screened Out)</option>
              <option value="Rejected: Post-Review" ${selectedVal === 'Rejected: Post-Review' ? 'selected' : ''}>🔴 Rejected: Post-Review</option>
              <option value="Rejected: Post-Interview" ${selectedVal === 'Rejected: Post-Interview' ? 'selected' : ''}>🔴 Rejected: Post-Interview</option>
            </optgroup>
          </select>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function updateLedgerStatus(key, newOption) {
  const item = applicationsMap[key];
  if (!item) return;

  item.stageHistory = item.stageHistory || [];

  if (newOption.startsWith('Rejected:')) {
    item.status = 'Rejected';
    if (newOption.includes('Post-Interview')) item.rejectionStage = 'post_interview';
    else if (newOption.includes('Post-Review')) item.rejectionStage = 'post_review';
    else item.rejectionStage = 'direct';
  } else if (newOption === 'No Response') {
    item.status = 'No Response';
    item.rejectionStage = 'no_response';
  } else {
    item.status = newOption;
    item.rejectionStage = '';
  }

  item.updatedAt = new Date().toISOString();
  item.stageHistory.push({
    stage: item.status,
    rejectionStage: item.rejectionStage,
    timestamp: item.updatedAt
  });

  saveLocalApplications();
  persistApplicationUpdate(key, item);

  renderKpiMetrics();
  renderSankeyFunnel();
  renderAnalyticsTable();
}

function syncAndRefreshDashboard() {
  const btn = document.getElementById('btnRefreshAnalytics');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="spin"></i> Syncing...`;
    if (window.lucide) lucide.createIcons();
  }

  fetchServerApplications().then(() => {
    applyTwentyDayAutoAging();
    renderKpiMetrics();
    renderAnalyticsTable();
    renderSankeyFunnel();
  }).finally(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="refresh-cw"></i> <span>Sync Data</span>`;
      if (window.lucide) lucide.createIcons();
    }
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const target = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
  try {
    localStorage.setItem('scrapedeez_theme', target);
  } catch (e) {}

  const sun = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');
  if (sun && moon) {
    sun.style.display = target === 'dark' ? 'inline-block' : 'none';
    moon.style.display = target === 'light' ? 'inline-block' : 'none';
  }

  if (isGoogleChartsReady) renderSankeyFunnel();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}
