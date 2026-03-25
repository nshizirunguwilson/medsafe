/* ─── MedSafe Client ─── */
(() => {
  'use strict';

  // ─── State ───
  let currentQuery = '';
  let aeCurrentPage = 0;
  const AE_PER_PAGE = 10;
  let aeTotalResults = 0;

  // ─── DOM refs ───
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const searchForm = $('#searchForm');
  const searchInput = $('#searchInput');
  const searchError = $('#searchError');
  const resultsSection = $('#resultsSection');
  const resultsQuery = $('#resultsQuery');

  // Tab content containers
  const drugInfoContent = $('#drugInfoContent');
  const adverseEventsContent = $('#adverseEventsContent');
  const drugLabelsContent = $('#drugLabelsContent');
  const recallsContent = $('#recallsContent');
  const aePagination = $('#aePagination');

  // ─── Tabs ───
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      $(`#panel-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ─── Helpers ───
  function showLoader(container) {
    container.innerHTML = `
      <div class="loader">
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
        <div class="loader-dot"></div>
      </div>`;
  }

  function showEmpty(container, message) {
    container.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
  }

  function showError(container, message) {
    container.innerHTML = `<div class="error-state"><p>${message}</p></div>`;
  }

  function formatDate(raw) {
    if (!raw) return '—';
    // OpenFDA dates: YYYYMMDD
    if (/^\d{8}$/.test(raw)) {
      const y = raw.slice(0, 4), m = raw.slice(4, 6), d = raw.slice(6, 8);
      return `${y}-${m}-${d}`;
    }
    // ISO or other
    const dt = new Date(raw);
    if (isNaN(dt)) return raw;
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len = 200) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  function sanitizeHtml(str) {
    if (!str) return '';
    const allowed = new Set(['b', 'i', 'em', 'strong', 'br', 'p', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'span', 'sub', 'sup']);
    const div = document.createElement('div');
    div.innerHTML = str;
    div.querySelectorAll('*').forEach(el => {
      if (!allowed.has(el.tagName.toLowerCase())) {
        el.replaceWith(...el.childNodes);
      }
      // Remove all attributes (no onclick, style, etc.)
      [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
    });
    return div.innerHTML;
  }

  // ─── Search ───
  let searchResults = { drugInfo: null, adverseEvents: null, drugLabels: null, recalls: null };

  function performSearch(query) {
    if (query.length < 2) {
      searchError.textContent = 'Please enter at least 2 characters.';
      searchError.hidden = false;
      return;
    }

    searchError.hidden = true;
    currentQuery = query;
    resultsQuery.textContent = query;
    resultsSection.hidden = false;
    searchResults = { drugInfo: null, adverseEvents: null, drugLabels: null, recalls: null };

    // Smooth scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Fire all API calls in parallel
    fetchDrugInfo(query);
    fetchAdverseEvents(query);
    fetchDrugLabels(query);
    fetchRecalls(query);
  }

  function checkAllEmpty() {
    // Only check once all 4 have responded
    if (Object.values(searchResults).some(v => v === null)) return;
    if (Object.values(searchResults).every(v => v === 'empty')) {
      // Show a banner above the tabs
      const existing = $('.no-results-banner');
      if (existing) existing.remove();
      const banner = document.createElement('div');
      banner.className = 'no-results-banner';
      banner.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.5v4M10 13v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span>No results found for <strong>${escapeHtml(currentQuery)}</strong>. This database covers US-registered drugs — try searching by a brand name like Advil, Lipitor, or Metformin.</span>
      `;
      $('.results-header').after(banner);
    } else {
      const existing = $('.no-results-banner');
      if (existing) existing.remove();
    }
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    performSearch(query);
  });

  // ─── 1. Drug Info (RapidAPI) ───
  async function fetchDrugInfo(query) {
    showLoader(drugInfoContent);
    try {
      const res = await fetch(`/api/drug-info?query=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        showError(drugInfoContent, data.error || 'Failed to fetch drug information.');
        searchResults.drugInfo = 'empty';
        checkAllEmpty();
        return;
      }

      if (!data.results || data.results.length === 0) {
        showEmpty(drugInfoContent, data.message || 'No drug information found.');
        searchResults.drugInfo = 'empty';
        checkAllEmpty();
        return;
      }

      searchResults.drugInfo = 'found';
      checkAllEmpty();
      renderDrugInfo(data.results);
    } catch (err) {
      showError(drugInfoContent, 'Could not connect to the drug information service. Please try again.');
      searchResults.drugInfo = 'empty';
      checkAllEmpty();
    }
  }

  function renderDrugInfo(drugs) {
    let html = '<div class="drug-info-grid">';

    drugs.forEach(drug => {
      const brand = escapeHtml(drug.brand_name || drug['brand_name'] || '—');
      const generic = escapeHtml(drug.generic_name || drug['generic_name'] || '—');
      const manufacturer = escapeHtml(drug.labeler_name || drug.manufacturer || '—');
      const activeIngredients = drug.active_ingredients
        ? drug.active_ingredients.map(i => escapeHtml(i.name || i.strength ? `${i.name} (${i.strength})` : i.name || String(i))).join(', ')
        : '—';
      const route = escapeHtml(Array.isArray(drug.route) ? drug.route.join(', ') : (drug.route || '—'));
      const dosageForm = escapeHtml(drug.dosage_form || '—');
      const productType = escapeHtml(drug.product_type || '—');
      const packaging = drug.packaging
        ? drug.packaging.map(p => escapeHtml(p.description || String(p))).join('; ')
        : '—';

      html += `
        <div class="drug-card">
          <div class="drug-card-header">
            <div class="drug-card-brand">${brand}</div>
            <div class="drug-card-generic">${generic}</div>
          </div>
          <div class="drug-card-body">
            <div class="drug-detail">
              <span class="drug-detail-label">Manufacturer</span>
              <span class="drug-detail-value">${manufacturer}</span>
            </div>
            <div class="drug-detail">
              <span class="drug-detail-label">Active Ingredients</span>
              <span class="drug-detail-value">${activeIngredients}</span>
            </div>
            <div class="drug-detail">
              <span class="drug-detail-label">Route</span>
              <span class="drug-detail-value">${route}</span>
            </div>
            <div class="drug-detail">
              <span class="drug-detail-label">Dosage Form</span>
              <span class="drug-detail-value">${dosageForm}</span>
            </div>
            <div class="drug-detail">
              <span class="drug-detail-label">Product Type</span>
              <span class="drug-detail-value">${productType}</span>
            </div>
            <div class="drug-detail">
              <span class="drug-detail-label">Packaging</span>
              <span class="drug-detail-value">${truncate(packaging, 150)}</span>
            </div>
          </div>
        </div>`;
    });

    html += '</div>';
    drugInfoContent.innerHTML = html;
  }

  // ─── 2. Adverse Events (OpenFDA) ───
  async function fetchAdverseEvents(query, page = 0) {
    showLoader(adverseEventsContent);
    aePagination.hidden = true;
    aeCurrentPage = page;

    const serious = $('#severityFilter').value;
    const dateStart = $('#dateStart').value;
    const dateEnd = $('#dateEnd').value;

    try {
      // Fetch both the events list and the top reactions count in parallel
      const [eventsRes, countsRes] = await Promise.all([
        fetch(`/api/adverse-events?query=${encodeURIComponent(query)}&serious=${serious}&date_start=${dateStart}&date_end=${dateEnd}&limit=${AE_PER_PAGE}&skip=${page * AE_PER_PAGE}`),
        fetch(`/api/adverse-events?query=${encodeURIComponent(query)}&serious=${serious}&date_start=${dateStart}&date_end=${dateEnd}&count_field=patient.reaction.reactionmeddrapt.exact`)
      ]);

      const eventsData = await eventsRes.json();
      const countsData = await countsRes.json();

      if (!eventsRes.ok) {
        showError(adverseEventsContent, eventsData.error || 'Failed to fetch adverse events.');
        searchResults.adverseEvents = 'empty';
        checkAllEmpty();
        return;
      }

      if ((!eventsData.results || eventsData.results.length === 0) && (!countsData.counts || countsData.counts.length === 0)) {
        showEmpty(adverseEventsContent, eventsData.message || 'No adverse events found for this drug.');
        searchResults.adverseEvents = 'empty';
        checkAllEmpty();
        return;
      }

      searchResults.adverseEvents = 'found';
      checkAllEmpty();
      aeTotalResults = eventsData.meta?.results?.total || 0;
      renderAdverseEvents(eventsData.results || [], countsData.counts || []);
      renderAePagination();
    } catch (err) {
      showError(adverseEventsContent, 'Could not connect to the adverse events service. Please try again.');
      searchResults.adverseEvents = 'empty';
      checkAllEmpty();
    }
  }

  function renderAdverseEvents(events, counts) {
    let html = '';

    // Top reactions bar chart
    if (counts.length > 0) {
      const topCounts = counts.slice(0, 8);
      const maxCount = topCounts[0]?.count || 1;

      html += `
        <div class="ae-summary">
          <div class="ae-summary-title">Top Reported Reactions</div>
          <div class="ae-bar-list">
            ${topCounts.map(c => `
              <div class="ae-bar-row">
                <span class="ae-bar-label" title="${escapeHtml(c.term)}">${escapeHtml(c.term)}</span>
                <div class="ae-bar-track">
                  <div class="ae-bar-fill" style="width: ${(c.count / maxCount * 100).toFixed(1)}%"></div>
                </div>
                <span class="ae-bar-count">${c.count.toLocaleString()}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    if (events.length > 0) {
      // Sort events client-side based on selected sort
      const sortVal = $('#aeSort').value;
      const sorted = [...events].sort((a, b) => {
        if (sortVal === 'date-asc') return (a.receivedate || '').localeCompare(b.receivedate || '');
        if (sortVal === 'serious-first') return (b.serious || 0) - (a.serious || 0);
        return (b.receivedate || '').localeCompare(a.receivedate || ''); // date-desc default
      });

      html += `
        <div class="ae-table-wrap">
          <table class="ae-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Severity</th>
                <th>Reactions</th>
                <th>Outcome</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map(ev => {
                const reactions = (ev.patient?.reaction || []).map(r => r.reactionmeddrapt).filter(Boolean);
                const serious = ev.serious === 1 || ev.serious === '1';
                const outcomes = [];
                if (ev.seriousnessdeath === '1') outcomes.push('Death');
                if (ev.seriousnesshospitalization === '1') outcomes.push('Hospitalization');
                if (ev.seriousnesslifethreatening === '1') outcomes.push('Life-threatening');
                if (ev.seriousnessdisabling === '1') outcomes.push('Disability');
                if (ev.seriousnesscongenitalanomali === '1') outcomes.push('Congenital anomaly');
                if (ev.seriousnessother === '1') outcomes.push('Other serious');
                const outcomeStr = outcomes.length > 0 ? outcomes.join(', ') : (serious ? 'Serious' : 'Non-serious');

                return `
                  <tr>
                    <td>${formatDate(ev.receivedate)}</td>
                    <td><span class="badge ${serious ? 'badge-serious' : 'badge-non-serious'}">${serious ? 'Serious' : 'Non-serious'}</span></td>
                    <td>
                      <div class="reactions-list">
                        ${reactions.slice(0, 5).map(r => `<span class="reaction-tag">${escapeHtml(r)}</span>`).join('')}
                        ${reactions.length > 5 ? `<span class="reaction-tag">+${reactions.length - 5} more</span>` : ''}
                      </div>
                    </td>
                    <td>${escapeHtml(outcomeStr)}</td>
                    <td>${escapeHtml(ev.primarysourcecountry || '—')}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    adverseEventsContent.innerHTML = html || '<div class="empty-state"><p>No individual event reports to display.</p></div>';
  }

  function renderAePagination() {
    if (aeTotalResults <= AE_PER_PAGE) {
      aePagination.hidden = true;
      return;
    }

    const totalPages = Math.ceil(Math.min(aeTotalResults, 5000) / AE_PER_PAGE); // OpenFDA caps skip at ~5000
    aePagination.hidden = false;
    aePagination.innerHTML = `
      <button class="pagination-btn" id="aePrev" ${aeCurrentPage === 0 ? 'disabled' : ''}>Previous</button>
      <span class="pagination-info">Page ${aeCurrentPage + 1} of ${totalPages.toLocaleString()} (${aeTotalResults.toLocaleString()} reports)</span>
      <button class="pagination-btn" id="aeNext" ${aeCurrentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
    `;

    $('#aePrev')?.addEventListener('click', () => fetchAdverseEvents(currentQuery, aeCurrentPage - 1));
    $('#aeNext')?.addEventListener('click', () => fetchAdverseEvents(currentQuery, aeCurrentPage + 1));
  }

  // Apply filters button
  $('#applyAeFilters').addEventListener('click', () => {
    if (currentQuery) fetchAdverseEvents(currentQuery, 0);
  });

  // ─── 3. Drug Labels (OpenFDA) ───
  async function fetchDrugLabels(query) {
    showLoader(drugLabelsContent);
    try {
      const res = await fetch(`/api/drug-labels?query=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        showError(drugLabelsContent, data.error || 'Failed to fetch drug labels.');
        searchResults.drugLabels = 'empty';
        checkAllEmpty();
        return;
      }

      if (!data.results || data.results.length === 0) {
        showEmpty(drugLabelsContent, data.message || 'No drug labels found.');
        searchResults.drugLabels = 'empty';
        checkAllEmpty();
        return;
      }

      searchResults.drugLabels = 'found';
      checkAllEmpty();
      renderDrugLabels(data.results);
    } catch (err) {
      showError(drugLabelsContent, 'Could not connect to the drug labels service. Please try again.');
      searchResults.drugLabels = 'empty';
      checkAllEmpty();
    }
  }

  function renderDrugLabels(labels) {
    const sections = [
      { key: 'indications_and_usage', title: 'Indications & Usage' },
      { key: 'dosage_and_administration', title: 'Dosage & Administration' },
      { key: 'warnings', title: 'Warnings' },
      { key: 'warnings_and_cautions', title: 'Warnings & Precautions' },
      { key: 'contraindications', title: 'Contraindications' },
      { key: 'adverse_reactions', title: 'Adverse Reactions' },
      { key: 'drug_interactions', title: 'Drug Interactions' },
      { key: 'overdosage', title: 'Overdosage' },
      { key: 'mechanism_of_action', title: 'Mechanism of Action' },
      { key: 'pregnancy', title: 'Pregnancy' }
    ];

    const chevronSvg = `<svg class="label-accordion-chevron" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    let html = '';
    labels.forEach(label => {
      const name = label.openfda?.brand_name?.[0] || label.openfda?.generic_name?.[0] || 'Drug Label';

      // Filter to sections that exist for this label
      const available = sections.filter(s => label[s.key] && label[s.key].length > 0);

      if (available.length === 0) return;

      html += `
        <div class="label-card">
          <div class="label-card-header">
            <div class="label-card-name">${escapeHtml(name)}</div>
          </div>
          <div class="label-sections">
            ${available.map(s => `
              <div class="label-accordion">
                <button class="label-accordion-trigger" aria-expanded="false">
                  ${escapeHtml(s.title)}
                  ${chevronSvg}
                </button>
                <div class="label-accordion-body">
                  <div class="label-accordion-inner">
                    <div class="label-accordion-text">${label[s.key].map(t => sanitizeHtml(t)).join('<br><br>')}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;
    });

    drugLabelsContent.innerHTML = html || '<div class="empty-state"><p>No label sections available.</p></div>';

    // Bind accordion toggles
    drugLabelsContent.querySelectorAll('.label-accordion-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const accordion = btn.closest('.label-accordion');
        const isOpen = accordion.classList.contains('open');
        accordion.classList.toggle('open');
        btn.setAttribute('aria-expanded', !isOpen);
      });
    });
  }

  // ─── 4. Recalls (OpenFDA) ───
  async function fetchRecalls(query) {
    showLoader(recallsContent);
    const status = $('#recallStatus').value;
    const classification = $('#recallClass').value;

    try {
      const res = await fetch(`/api/recalls?query=${encodeURIComponent(query)}&status=${status}&classification=${classification}`);
      const data = await res.json();

      if (!res.ok) {
        showError(recallsContent, data.error || 'Failed to fetch recalls.');
        searchResults.recalls = 'empty';
        checkAllEmpty();
        return;
      }

      if (!data.results || data.results.length === 0) {
        showEmpty(recallsContent, data.message || 'No recalls found for this drug — that\'s a good sign.');
        searchResults.recalls = 'empty';
        checkAllEmpty();
        return;
      }

      searchResults.recalls = 'found';
      checkAllEmpty();
      renderRecalls(data.results);
    } catch (err) {
      showError(recallsContent, 'Could not connect to the recalls service. Please try again.');
      searchResults.recalls = 'empty';
      checkAllEmpty();
    }
  }

  function renderRecalls(recalls) {
    let html = '<div class="recall-list">';

    recalls.forEach(r => {
      const cls = (r.classification || '').toLowerCase();
      let badgeClass = 'badge-class-iii';
      if (cls.includes('class i') && !cls.includes('class ii')) badgeClass = 'badge-class-i';
      else if (cls.includes('class ii')) badgeClass = 'badge-class-ii';

      const status = r.status || 'Unknown';
      let statusBadge = 'badge-terminated';
      if (status === 'Ongoing') statusBadge = 'badge-ongoing';
      else if (status === 'Completed') statusBadge = 'badge-completed';

      html += `
        <div class="recall-card">
          <div class="recall-card-top">
            <span class="recall-card-number">${escapeHtml(r.recall_number || '—')}</span>
            <span class="badge ${badgeClass}">${escapeHtml(r.classification || '—')}</span>
            <span class="badge ${statusBadge}">${escapeHtml(status)}</span>
          </div>
          <div class="recall-card-reason">${escapeHtml(r.reason_for_recall || 'No reason provided.')}</div>
          <div class="recall-meta">
            <div class="recall-meta-item"><strong>Firm:</strong> ${escapeHtml(r.recalling_firm || '—')}</div>
            <div class="recall-meta-item"><strong>Initiated:</strong> ${formatDate(r.recall_initiation_date)}</div>
            <div class="recall-meta-item"><strong>Product:</strong> ${escapeHtml(truncate(r.product_description, 120))}</div>
            ${r.voluntary_mandated ? `<div class="recall-meta-item"><strong>Type:</strong> ${escapeHtml(r.voluntary_mandated)}</div>` : ''}
          </div>
        </div>`;
    });

    html += '</div>';
    recallsContent.innerHTML = html;
  }

  // Apply recall filters
  $('#applyRecallFilters').addEventListener('click', () => {
    if (currentQuery) fetchRecalls(currentQuery);
  });

  // ─── Barcode Scanner ───
  const barcodeBtn = $('#barcodeBtn');
  const barcodeModal = $('#barcodeModal');
  const barcodeModalClose = $('#barcodeModalClose');
  const barcodeLookupStatus = $('#barcodeLookupStatus');
  let html5QrCode = null;
  let isScanning = false;

  function openBarcodeModal() {
    barcodeModal.hidden = false;
    barcodeLookupStatus.hidden = true;
    if ($('#barcodeScanPanel').classList.contains('active')) {
      startScanner();
    }
  }

  function closeBarcodeModal() {
    barcodeModal.hidden = true;
    stopScanner();
  }

  function startScanner() {
    if (isScanning) return;

    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      showBarcodeStatus('Camera scanning requires HTTPS. Please use the live site or enter the barcode manually.', 'error');
      return;
    }

    // Reset the scanner container so it can be reused
    const reader = $('#barcodeScanReader');
    reader.innerHTML = '';

    html5QrCode = new Html5Qrcode('barcodeScanReader', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39
      ]
    });

    const readerWidth = reader.offsetWidth || 300;
    const qrboxWidth = Math.min(readerWidth - 40, 280);
    const qrboxHeight = Math.min(Math.floor(qrboxWidth * 0.4), 120);

    isScanning = true;

    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: { width: qrboxWidth, height: qrboxHeight }, aspectRatio: 1.0 },
      (decodedText) => {
        if (!isScanning) return;
        isScanning = false;
        // Wait for stop to complete before looking up
        html5QrCode.stop().then(() => {
          try { html5QrCode.clear(); } catch(e) {}
          html5QrCode = null;
          lookupBarcode(decodedText);
        }).catch(() => {
          html5QrCode = null;
          lookupBarcode(decodedText);
        });
      },
      () => {}
    ).catch((err) => {
      isScanning = false;
      html5QrCode = null;
      const msg = String(err);
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        showBarcodeStatus('Camera permission denied. Please allow camera access in your browser settings, or use manual entry.', 'error');
      } else if (msg.includes('NotFoundError') || msg.includes('no camera')) {
        showBarcodeStatus('No camera found on this device. Use the manual entry tab instead.', 'error');
      } else {
        showBarcodeStatus('Could not start camera. Use the manual entry tab instead.', 'error');
      }
    });
  }

  function stopScanner() {
    isScanning = false;
    if (html5QrCode) {
      const scanner = html5QrCode;
      html5QrCode = null;
      scanner.stop().then(() => {
        try { scanner.clear(); } catch(e) {}
      }).catch(() => {
        try { scanner.clear(); } catch(e) {}
      });
    }
  }

  function showBarcodeStatus(msg, type) {
    barcodeLookupStatus.hidden = false;
    barcodeLookupStatus.textContent = msg;
    barcodeLookupStatus.className = 'barcode-status ' + type;
  }

  async function lookupBarcode(code) {
    showBarcodeStatus('Looking up barcode...', 'loading');

    try {
      const res = await fetch(`/api/barcode-lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();

      if (!res.ok) {
        showBarcodeStatus(data.error || 'Lookup failed.', 'error');
        return;
      }

      if (data.drug_name) {
        showBarcodeStatus(`Found: ${data.drug_name}${data.manufacturer ? ' by ' + data.manufacturer : ''}. Searching...`, 'success');
        const drugName = data.drug_name;
        setTimeout(() => {
          try { closeBarcodeModal(); } catch (e) { barcodeModal.hidden = true; }
          searchInput.value = drugName;
          performSearch(drugName);
        }, 800);
      } else {
        showBarcodeStatus('No drug found for this barcode. This database covers US-registered (FDA) drugs only. Non-US drugs may not be recognized. Try entering the drug name in the search bar instead.', 'error');
      }
    } catch {
      showBarcodeStatus('Could not connect to the lookup service. Please try again.', 'error');
    }
  }

  barcodeBtn.addEventListener('click', openBarcodeModal);
  barcodeModalClose.addEventListener('click', closeBarcodeModal);
  barcodeModal.addEventListener('click', (e) => {
    if (e.target === barcodeModal) closeBarcodeModal();
  });

  // Barcode tab switching
  $$('.barcode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.barcode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.barcode-panel').forEach(p => p.classList.remove('active'));
      const panel = tab.dataset.btab === 'scan' ? '#barcodeScanPanel' : '#barcodeManualPanel';
      $(panel).classList.add('active');

      if (tab.dataset.btab === 'scan') {
        startScanner();
      } else {
        stopScanner();
      }
    });
  });

  // Manual barcode lookup
  $('#barcodeManualLookup').addEventListener('click', () => {
    const code = $('#barcodeManualInput').value.trim();
    if (code.length < 8) {
      showBarcodeStatus('Please enter at least 8 digits.', 'error');
      return;
    }
    lookupBarcode(code);
  });

  $('#barcodeManualInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#barcodeManualLookup').click();
    }
  });

})();
