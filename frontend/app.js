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
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();

    if (query.length < 2) {
      searchError.textContent = 'Please enter at least 2 characters.';
      searchError.hidden = false;
      return;
    }

    searchError.hidden = true;
    currentQuery = query;
    resultsQuery.textContent = query;
    resultsSection.hidden = false;

    // Smooth scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Fire all API calls in parallel
    fetchDrugInfo(query);
    fetchAdverseEvents(query);
    fetchDrugLabels(query);
    fetchRecalls(query);
  });

  // ─── 1. Drug Info (RapidAPI) ───
  async function fetchDrugInfo(query) {
    showLoader(drugInfoContent);
    try {
      const res = await fetch(`/api/drug-info?query=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        showError(drugInfoContent, data.error || 'Failed to fetch drug information.');
        return;
      }

      if (!data.results || data.results.length === 0) {
        showEmpty(drugInfoContent, data.message || 'No drug information found.');
        return;
      }

      renderDrugInfo(data.results);
    } catch (err) {
      showError(drugInfoContent, 'Could not connect to the drug information service. Please try again.');
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

})();
