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
