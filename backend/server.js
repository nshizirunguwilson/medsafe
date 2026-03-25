const path = require('path');
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_ID = process.env.SERVER_ID || os.hostname();

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please wait a moment and try again.' }
});
app.use('/api', limiter);
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use(express.json());

// ─── Shared helpers ───
const OPENFDA_BASE = 'https://api.fda.gov';
const RAPIDAPI_HOST = 'drug-info-and-price-history.p.rapidapi.com';

function rapidHeaders() {
  return {
    'x-rapidapi-key': process.env.RAPIDAPI_KeyDrugInfoAndPriceHistory,
    'x-rapidapi-host': RAPIDAPI_HOST
  };
}

function fdaParams(extra = {}) {
  const params = { ...extra };
  if (process.env.openFDA) {
    params.api_key = process.env.openFDA;
  }
  return params;
}

// ─── 1. Drug Info (RapidAPI) ───
app.get('/api/drug-info', async (req, res) => {
  const { query } = req.query;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
  }

  try {
    const response = await axios.get(`https://${RAPIDAPI_HOST}/1/druginfo`, {
      headers: rapidHeaders(),
      params: { drug: query.trim() },
      timeout: 10000
    });

    const results = response.data;
    if (!results || (Array.isArray(results) && results.length === 0)) {
      return res.json({ results: [], message: 'No drug information found.' });
    }

    res.json({ results: Array.isArray(results) ? results : [results] });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.json({ results: [], message: 'No drug information found for this query.' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'API rate limit reached. Please try again shortly.' });
    }
    console.error('Drug info error:', err.message);
    res.status(502).json({ error: 'Unable to fetch drug information. The service may be temporarily unavailable.' });
  }
});

// ─── 2. Adverse Events (OpenFDA) ───
app.get('/api/adverse-events', async (req, res) => {
  const { query, serious, date_start, date_end, limit = 10, skip = 0, count_field } = req.query;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
  }

  try {
    let searchParts = [`patient.drug.openfda.brand_name:"${query.trim()}"+patient.drug.openfda.generic_name:"${query.trim()}"`];

    if (serious && serious !== 'all') {
      searchParts.push(`serious:${serious}`);
    }

    if (date_start || date_end) {
      const start = date_start ? date_start.replace(/-/g, '') : '19000101';
      const end = date_end ? date_end.replace(/-/g, '') : '20991231';
      searchParts.push(`receivedate:[${start}+TO+${end}]`);
    }

    const search = searchParts.join('+AND+');

    // If count_field is provided, return aggregated counts
    if (count_field) {
      const response = await axios.get(`${OPENFDA_BASE}/drug/event.json`, {
        params: fdaParams({ search, count: count_field }),
        timeout: 10000
      });
      return res.json({ counts: response.data.results || [] });
    }

    const response = await axios.get(`${OPENFDA_BASE}/drug/event.json`, {
      params: fdaParams({ search, limit: Math.min(Number(limit), 100), skip: Number(skip) }),
      timeout: 10000
    });

    res.json({
      results: response.data.results || [],
      meta: response.data.meta || {}
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.json({ results: [], meta: {}, message: 'No adverse events found.' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'OpenFDA rate limit reached. Please wait and try again.' });
    }
    console.error('Adverse events error:', err.message);
    res.status(502).json({ error: 'Unable to fetch adverse event data.' });
  }
});

// ─── 3. Drug Labels (OpenFDA) ───
app.get('/api/drug-labels', async (req, res) => {
  const { query, limit = 5 } = req.query;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
  }

  try {
    const search = `openfda.brand_name:"${query.trim()}"+openfda.generic_name:"${query.trim()}"`;
    const response = await axios.get(`${OPENFDA_BASE}/drug/label.json`, {
      params: fdaParams({ search, limit: Math.min(Number(limit), 25) }),
      timeout: 10000
    });

    res.json({
      results: response.data.results || [],
      meta: response.data.meta || {}
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.json({ results: [], meta: {}, message: 'No drug labels found.' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'OpenFDA rate limit reached. Please wait and try again.' });
    }
    console.error('Drug labels error:', err.message);
    res.status(502).json({ error: 'Unable to fetch drug label data.' });
  }
});

// ─── 4. Recalls / Enforcement (OpenFDA) ───
app.get('/api/recalls', async (req, res) => {
  const { query, status, classification, limit = 10 } = req.query;
  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
  }

  try {
    let searchParts = [`product_description:"${query.trim()}"+openfda.brand_name:"${query.trim()}"+openfda.generic_name:"${query.trim()}"`];

    if (status && status !== 'all') {
      searchParts.push(`status:"${status}"`);
    }
    if (classification && classification !== 'all') {
      searchParts.push(`classification:"${classification}"`);
    }

    const search = searchParts.join('+AND+');
    const response = await axios.get(`${OPENFDA_BASE}/drug/enforcement.json`, {
      params: fdaParams({ search, limit: Math.min(Number(limit), 100), sort: 'recall_initiation_date:desc' }),
      timeout: 10000
    });

    res.json({
      results: response.data.results || [],
      meta: response.data.meta || {}
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.json({ results: [], meta: {}, message: 'No recalls found for this drug.' });
    }
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'OpenFDA rate limit reached. Please wait and try again.' });
    }
    console.error('Recalls error:', err.message);
    res.status(502).json({ error: 'Unable to fetch recall data.' });
  }
});

// ─── 5. Barcode Lookup (OpenFDA) ───
app.get('/api/barcode-lookup', async (req, res) => {
  const { code } = req.query;
  if (!code || code.trim().length < 4) {
    return res.status(400).json({ error: 'Please enter a valid barcode or NDC number.' });
  }

  const cleaned = code.trim().replace(/[^0-9-]/g, '');

  // Convert UPC-A (12 digits) or EAN-13 (13 digits) to possible NDC formats
  function upcToNdcVariants(upc) {
    const digits = upc.replace(/[^0-9]/g, '');
    const variants = new Set();

    function addNdcFormats(core) {
      if (core.length === 10) {
        // NDC formats: 4-4-2, 5-3-2, 5-4-1
        variants.add(`${core.slice(0,5)}-${core.slice(5,8)}-${core.slice(8,10)}`);
        variants.add(`${core.slice(0,5)}-${core.slice(5,9)}-${core.slice(9,10)}`);
        variants.add(`${core.slice(0,4)}-${core.slice(4,8)}-${core.slice(8,10)}`);
      } else if (core.length === 9) {
        variants.add(`${core.slice(0,4)}-${core.slice(4,7)}-${core.slice(7,9)}`);
        variants.add(`${core.slice(0,5)}-${core.slice(5,8)}-${core.slice(8,9)}`);
        variants.add(`${core.slice(0,5)}-${core.slice(5,7)}-${core.slice(7,9)}`);
      }
    }

    if (digits.length === 12) {
      // UPC-A: digit[0] is indicator, digits[1-10] are NDC, digit[11] is check
      addNdcFormats(digits.slice(1, 11));
    } else if (digits.length === 13) {
      // EAN-13: try multiple slicing strategies
      addNdcFormats(digits.slice(3, 12)); // skip 3-char country prefix, drop check
      addNdcFormats(digits.slice(2, 12)); // skip 2-char prefix, drop check
    }

    return [...variants];
  }

  try {
    // Build search queries: direct UPC, direct input as NDC, then UPC→NDC conversions
    const searches = [
      `openfda.upc:"${cleaned}"`,
      `openfda.product_ndc:"${cleaned}"`,
      `openfda.package_ndc:"${cleaned}"`
    ];

    // Add UPC→NDC converted variants
    const ndcVariants = upcToNdcVariants(cleaned);
    for (const ndc of ndcVariants) {
      searches.push(`openfda.product_ndc:"${ndc}"`);
      searches.push(`openfda.package_ndc:"${ndc}"`);
    }

    // Deduplicate
    const uniqueSearches = [...new Set(searches)];

    for (const search of uniqueSearches) {
      try {
        const response = await axios.get(`${OPENFDA_BASE}/drug/label.json`, {
          params: fdaParams({ search, limit: 1 }),
          timeout: 10000
        });

        const result = response.data.results?.[0];
        if (result) {
          const drugName = result.openfda?.brand_name?.[0] || result.openfda?.generic_name?.[0] || null;
          if (drugName) {
            return res.json({
              drug_name: drugName,
              generic_name: result.openfda?.generic_name?.[0] || null,
              manufacturer: result.openfda?.manufacturer_name?.[0] || null
            });
          }
        }
      } catch (innerErr) {
        if (innerErr.response?.status !== 404) throw innerErr;
      }
    }

    res.json({ drug_name: null, message: 'No drug found for this barcode. Try entering the drug name instead.' });
  } catch (err) {
    if (err.response?.status === 429) {
      return res.status(429).json({ error: 'Rate limit reached. Please wait and try again.' });
    }
    console.error('Barcode lookup error:', err.message);
    res.status(502).json({ error: 'Unable to look up barcode. Please try again.' });
  }
});

// ─── Health check ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: SERVER_ID, timestamp: new Date().toISOString() });
});

// ─── SPA fallback ───
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MedSafe running on http://localhost:${PORT}`);
});
