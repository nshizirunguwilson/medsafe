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
