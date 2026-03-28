# MedSafe | Drug Safety Intelligence

MedSafe is a web application that lets users search for any drug and instantly view safety-critical information aggregated from multiple authoritative sources. It combines drug product details, adverse event reports, FDA labeling, and recall data into a single, easy-to-navigate interface.

**Live Application:** [https://medsafe.wilsonn.tech](https://medsafe.wilsonn.tech)

**Demo Video:** [https://youtu.be/RD8E24KuXOI](https://youtu.be/RD8E24KuXOI)

## Features

- **Drug Information** -- Brand name, generic name, active ingredients, manufacturer, route, dosage form, and packaging details
- **Adverse Event Reports** -- Browse FDA adverse event reports with filtering by severity (non-serious, hospitalization, death, etc.) and date range, sorting by date or seriousness, and a visual bar chart of top reported reactions
- **Drug Labels** -- Expandable accordion sections for indications, dosage, warnings, contraindications, adverse reactions, drug interactions, and more
- **Recalls & Enforcement** -- Active and historical FDA recalls filterable by status (Ongoing/Completed/Terminated) and classification (Class I/II/III)
- **Barcode Scanner** -- Scan a drug's UPC barcode with your phone camera or enter the NDC/UPC code manually to look up any US-registered drug instantly
- **Pagination** -- Navigate through large sets of adverse event reports (up to 25,000 results via OpenFDA's skip limit)
- **Responsive Design** -- Works on desktop, tablet, and mobile
- **XSS Protection** -- HTML content from FDA labels is sanitized to prevent cross-site scripting attacks
- **Rate Limiting** -- Server-side rate limiting (60 requests/minute) to protect API keys from abuse

## Why a Backend Instead of Plain JavaScript?

MedSafe uses an Express.js backend server as an API proxy rather than calling external APIs directly from the browser. There are five reasons for this architectural decision:

### 1. API Key Security
If the APIs were called directly from JavaScript, anyone could open DevTools, go to the Network tab, and see the API keys in the request headers. By routing requests through Express, the keys stay in `.env` on the server and are never exposed to the browser.

### 2. CORS Restrictions
Some APIs block requests from browsers directly (Cross-Origin Resource Sharing). The browser would throw CORS errors. The Express server makes the requests server-side, so CORS restrictions do not apply.

### 3. Rate Limiting Control
Rate limiting (60 requests/minute) is implemented on the backend using `express-rate-limit`. If this was done client-side, users could simply disable it in DevTools. Server-side rate limiting actually protects the API keys from abuse.

### 4. Data Transformation
The barcode lookup requires trying multiple NDC format conversions (UPC-A to NDC, stripping check digits, trying 4-4-2 / 5-3-2 / 5-4-1 formats, etc.) and multiple sequential API calls. Doing that on the server keeps the frontend simple and avoids exposing the conversion logic.

### 5. Single Point of Update
If an API changes its URL or response format, only `server.js` needs to be updated -- not the frontend code deployed to users' browsers.

## APIs Used

### 1. OpenFDA

- **Provider:** U.S. Food and Drug Administration
- **Documentation:** [https://open.fda.gov/apis/](https://open.fda.gov/apis/)
- **Endpoints used:**
  - `/drug/event.json` -- Adverse event reports (FAERS database)
  - `/drug/label.json` -- Drug labeling (SPL format) and barcode/NDC lookup
  - `/drug/enforcement.json` -- Recall and enforcement data
- **What it provides:** Drug adverse events, drug labels, recalls, enforcement actions, barcode-to-drug resolution

### 2. Drug Info and Price History (RapidAPI)

- **Provider:** rnelsomain (via RapidAPI marketplace)
- **Documentation:** [https://rapidapi.com/rnelsomain/api/drug-info-and-price-history](https://rapidapi.com/rnelsomain/api/drug-info-and-price-history)
- **Endpoint used:** `/1/druginfo` -- Drug product details
- **What it provides:** Drug details, generic names, active ingredients, manufacturer info, packaging

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express |
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Barcode Scanning** | [html5-qrcode](https://github.com/mebjas/html5-qrcode) (supports UPC-A, UPC-E, EAN-13, EAN-8, CODE-128, CODE-39) |
| **Font** | [Outfit](https://fonts.google.com/specimen/Outfit) (Google Fonts) |
| **Process Manager** | PM2 (production deployment) |
| **Reverse Proxy / Load Balancer** | Nginx (round-robin) |
| **SSL/HTTPS** | Let's Encrypt via Certbot |
| **Firewall** | UFW on all servers |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.21.0 | HTTP server and routing |
| `axios` | ^1.7.2 | HTTP client for external API calls |
| `dotenv` | ^16.4.5 | Load environment variables from `.env` |
| `express-rate-limit` | ^7.4.0 | Rate limiting middleware |

## Prerequisites

- Node.js 18+ and npm
- API keys for OpenFDA and RapidAPI (Drug Info and Price History)

## Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nshizirunguwilson/summative.git
   cd summative
   ```

2. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

3. **Create a `.env` file** inside `backend/` (see `backend/.env.example`):
   ```
   openFDA=your_openfda_api_key
   RAPIDAPI_KeyDrugInfoAndPriceHistory=your_rapidapi_key
   PORT=3000
   ```

4. **Start the application:**
   ```bash
   npm start
   ```

5. **Open your browser** and navigate to `http://localhost:3000`

### How to Use

1. Type a drug name (e.g., "ibuprofen", "metformin", "lisinopril") in the search bar and click **Search**
2. Browse the four tabs:
   - **Drug Info** -- View product details (brand name, generic name, manufacturer, active ingredients, route, dosage form, packaging)
   - **Adverse Events** -- View reported adverse events with a bar chart of top reactions; filter by severity and date range; sort by date or seriousness; paginate through results
   - **Drug Labels** -- Expand accordion sections to read official FDA labeling (indications, warnings, dosage, contraindications, etc.)
   - **Recalls** -- View FDA enforcement actions; filter by status (Ongoing/Completed/Terminated) and classification (Class I/II/III)
3. Click the **barcode icon** next to the search bar to scan a drug barcode with your camera or enter an NDC/UPC code manually

## Deployment to Web Servers

The application is deployed on two web servers behind an Nginx load balancer with SSL:

| Server | IP Address | Role |
|--------|-----------|------|
| Web01 | 34.239.0.61 | Application server |
| Web02 | 3.87.217.227 | Application server |
| Lb01 | 3.86.83.174 | Nginx load balancer + SSL termination |

### Architecture

```
                        Internet
                           |
                    [medsafe.wilsonn.tech]
                           |
                      HTTPS (443)
                           |
                    ┌──────────────┐
                    │   Lb01       │
                    │   Nginx LB   │
                    │   + SSL      │
                    │   + UFW      │
                    └──────┬───────┘
                    Round-Robin (HTTP 80)
                    ┌──────┴───────┐
              ┌─────────┐    ┌─────────┐
              │  Web01   │    │  Web02   │
              │  Nginx   │    │  Nginx   │
              │  → :3000 │    │  → :3000 │
              │  Node/PM2│    │  Node/PM2│
              │  + UFW   │    │  + UFW   │
              └─────────┘    └─────────┘
```

- **Lb01** receives all HTTPS traffic, terminates SSL, and distributes requests to Web01 and Web02 using round-robin
- **Web01 and Web02** each run Nginx as a reverse proxy forwarding to the Node.js app on port 3000 (managed by PM2)
- **UFW** is enabled on all three servers, allowing only SSH (22), HTTP (80), and HTTPS (443) -- port 3000 is not exposed to the internet

### Step 1: Install Node.js and PM2 on Web01 and Web02

SSH into each web server and run:

```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2
```

### Step 2: Deploy the Application on Web01 and Web02

On each web server:

```bash
# Clone the repository
cd /home/$USER
git clone https://github.com/nshizirunguwilson/summative.git
cd summative/backend

# Install dependencies
npm install

# Create the .env file with API keys
cat > .env << 'EOF'
openFDA=your_openfda_api_key
RAPIDAPI_KeyDrugInfoAndPriceHistory=your_rapidapi_key
PORT=3000
SERVER_ID=web01
EOF

# On Web02, set SERVER_ID=web02 instead

# Start the application with PM2
pm2 start server.js --name medsafe
pm2 save
pm2 startup
```

Verify the application is running:

```bash
curl http://localhost:3000/api/health
```

Expected output: `{"status":"ok","server":"web01","timestamp":"..."}`

### Step 3: Configure Nginx Reverse Proxy on Web01 and Web02

On each web server, create an Nginx site config to reverse proxy traffic to the Node.js app:

```bash
sudo nano /etc/nginx/sites-available/medsafe
```

Add the following:

```nginx
server {
    listen 80;
    server_name medsafe.wilsonn.tech;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/medsafe /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Configure Firewall (UFW) on Web01 and Web02

Set up UFW to only allow SSH and HTTP/HTTPS traffic, blocking direct access to port 3000:

```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx HTTP'
sudo ufw allow 'Nginx HTTPS'
sudo ufw enable
sudo ufw status
```

This ensures the Node.js app is only accessible through the Nginx reverse proxy.

### Step 5: Configure the Load Balancer (Lb01)

SSH into the load balancer server and install Nginx:

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

Create the load balancer config:

```bash
sudo nano /etc/nginx/sites-available/medsafe
```

Add the following upstream configuration for round-robin load balancing:

```nginx
upstream medsafe_backend {
    server 34.239.0.61:80;
    server 3.87.217.227:80;
}

server {
    listen 80;
    server_name medsafe.wilsonn.tech;

    location / {
        proxy_pass http://medsafe_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and reload:

```bash
sudo ln -s /etc/nginx/sites-available/medsafe /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 6: Configure SSL with Let's Encrypt (Lb01)

Install Certbot and obtain an SSL certificate for the domain:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d medsafe.wilsonn.tech --non-interactive --agree-tos --email your-email@example.com --redirect
```

Certbot automatically configures Nginx to serve HTTPS and redirect HTTP traffic to HTTPS.

### Step 7: Configure Firewall (UFW) on Lb01

```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### Step 8: Verify Load Balancing

Test that the load balancer distributes requests between both servers. The `server` field in each response identifies which backend handled the request:

```bash
# Run multiple requests -- you should see alternating server IDs (web01 / web02)
for i in {1..6}; do curl -s https://medsafe.wilsonn.tech/api/health; echo; done
```

Expected output (round-robin):
```
{"status":"ok","server":"web01","timestamp":"..."}
{"status":"ok","server":"web02","timestamp":"..."}
{"status":"ok","server":"web01","timestamp":"..."}
{"status":"ok","server":"web02","timestamp":"..."}
{"status":"ok","server":"web01","timestamp":"..."}
{"status":"ok","server":"web02","timestamp":"..."}
```

### Step 9: Verify SSL and HTTP Redirect

```bash
# Should return 200 OK over HTTPS
curl -sI https://medsafe.wilsonn.tech | head -3

# Should return 301 redirect from HTTP to HTTPS
curl -sI http://medsafe.wilsonn.tech | head -3
```

The application is live at: **https://medsafe.wilsonn.tech**

## API Endpoints

The Express backend exposes the following API routes:

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|------------|
| GET | `/api/drug-info` | Drug product details | `query` (required) |
| GET | `/api/adverse-events` | FDA adverse event reports | `query` (required), `serious`, `date_start`, `date_end`, `limit`, `skip`, `count_field` |
| GET | `/api/drug-labels` | FDA drug labeling | `query` (required), `limit` |
| GET | `/api/recalls` | FDA recall/enforcement data | `query` (required), `status`, `classification`, `limit` |
| GET | `/api/barcode-lookup` | Look up drug by UPC/NDC code | `code` (required) |
| GET | `/api/health` | Server health check | none |

## Error Handling

The application handles errors at every level:

- **Input validation:** Search queries must be at least 2 characters; barcode codes must be at least 4 characters
- **Loading states:** Animated dot loader displayed during API calls so users know data is being fetched
- **Empty states:** Friendly messages when no results are found, including a banner when all tabs return empty suggesting users try US drug names
- **API failures:** Graceful fallback -- if one API is down, the other tabs still work independently since each tab fetches data from a separate endpoint
- **Rate limiting:** Server-side rate limiting (60 requests/minute per IP) with a clear error message: "Too many requests. Please wait a moment and try again."
- **API rate limits:** OpenFDA and RapidAPI rate limit errors (HTTP 429) are caught and shown as user-friendly messages
- **Network timeouts:** All external API calls have a 10-second timeout to prevent hanging requests
- **Barcode errors:** Clear feedback when a scanned barcode is not found, showing the scanned code and a "Scan Again" button to retry
- **Camera fallback:** If camera access is denied or unavailable, the user is prompted to use the manual entry tab instead
- **XSS protection:** HTML content from FDA labels is sanitized -- all unsafe tags and attributes are stripped while preserving safe formatting tags (`<b>`, `<p>`, `<ul>`, `<table>`)

## Security Measures

- **API keys in `.env`:** All API keys are stored server-side in environment variables and never sent to the browser
- **`.gitignore`:** The `.env` file, `node_modules/`, and other sensitive files are excluded from version control
- **Server-side proxy:** The Express backend makes all external API calls, so API keys and third-party endpoints are never visible in browser DevTools
- **Rate limiting:** `express-rate-limit` middleware caps requests at 60/minute per IP address
- **Input sanitization:** User search queries are trimmed and validated before being forwarded to external APIs
- **XSS sanitization:** All HTML content from OpenFDA label fields is stripped of scripts, event handlers, and unsafe tags before rendering
- **UFW firewall:** All three servers only allow ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) -- port 3000 is blocked from external access
- **HTTPS:** All traffic is encrypted via Let's Encrypt SSL; HTTP requests are automatically redirected to HTTPS
- **Trust proxy:** Express is configured with `trust proxy` so rate limiting correctly identifies clients behind the Nginx reverse proxy

## Project Structure

```
summative/
├── backend/
│   ├── server.js          # Express server with 5 API proxy routes
│   ├── package.json       # Dependencies and scripts
│   ├── package-lock.json
│   ├── .env               # API keys (not committed)
│   └── .env.example       # Template for environment variables
├── frontend/
│   ├── index.html         # Single-page application
│   ├── styles.css         # All styles (responsive)
│   └── app.js             # Client-side JavaScript (tabs, charts, filters, barcode)
├── .gitignore             # Excludes node_modules, .env
└── README.md              # This file
```

## Challenges and Solutions

1. **OpenFDA search syntax** -- The OpenFDA API uses a unique search syntax with `+AND+` operators and date formatting as `YYYYMMDD`. Standard URL encoding would break the `+` signs, so I built a custom URL builder (`fdaUrl()`) that preserves literal `+` characters in search queries while encoding other parameters normally.

2. **Handling multiple API sources** -- Each tab fetches data independently from different endpoints, so if one API is down or rate-limited, the others still work. All API calls fire in parallel on search for faster results.

3. **Adverse event data volume** -- OpenFDA can return hundreds of thousands of results. I implemented server-side pagination using OpenFDA's `skip` and `limit` parameters (capped at 25,000 by OpenFDA's skip limit) and client-side sorting to keep the interface responsive.

4. **Secure API key handling** -- API keys are stored in `.env` and never exposed to the frontend. The Express server acts as a proxy, making all external API calls server-side so keys never appear in browser network traffic.

5. **Barcode-to-drug resolution** -- Drug packages use UPC barcodes, but OpenFDA indexes drugs by NDC (National Drug Code). I implemented a multi-strategy conversion: UPC-A to NDC format conversion (stripping check digit and leading zero), direct NDC lookup, and UPC search via the `openfda.upc` field, trying three NDC format patterns (4-4-2, 5-3-2, 5-4-1) until a match is found.

6. **XSS protection on FDA labels** -- OpenFDA returns raw HTML in drug label fields. I built a sanitizer that strips all unsafe tags and attributes (scripts, event handlers, iframes) while preserving safe formatting tags like `<b>`, `<p>`, `<ul>`, and `<table>`.

7. **Camera lifecycle on mobile** -- The html5-qrcode library requires careful cleanup of the video stream and DOM elements between scans. I implemented a scanning lock flag and proper async cleanup to prevent camera reuse issues on iOS Safari.

## Credits

- **OpenFDA** -- U.S. Food and Drug Administration ([open.fda.gov](https://open.fda.gov/)) -- adverse events, drug labels, recalls, barcode lookup
- **Drug Info and Price History API** -- rnelsomain via [RapidAPI](https://rapidapi.com/rnelsomain/api/drug-info-and-price-history) -- drug product details
- **html5-qrcode** -- Minhaz ([github.com/mebjas/html5-qrcode](https://github.com/mebjas/html5-qrcode)) -- barcode scanning library
- **Outfit Font** -- Rodrigo Fuenzalida via [Google Fonts](https://fonts.google.com/specimen/Outfit)
- **Express** -- [expressjs.com](https://expressjs.com/) -- Node.js web framework
- **Axios** -- [axios-http.com](https://axios-http.com/) -- HTTP client
- **PM2** -- [pm2.keymetrics.io](https://pm2.keymetrics.io/) -- Node.js process manager
- **Let's Encrypt** -- [letsencrypt.org](https://letsencrypt.org/) -- free SSL certificates

## License

This project was created as an academic assignment. All APIs are used in accordance with their respective terms of service.
