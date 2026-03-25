# MedSafe | Drug Safety Intelligence

MedSafe is a web application that lets users search for any drug and instantly view safety-critical information aggregated from multiple authoritative sources. It combines drug product details, adverse event reports, FDA labeling, and recall data into a single, easy-to-navigate interface.

## Features

- **Drug Information** — Brand name, generic name, active ingredients, manufacturer, route, dosage form, and packaging details
- **Adverse Event Reports** — Browse FDA adverse event reports with filtering by severity and date range, sorting by date or seriousness, and a visual bar chart of top reported reactions
- **Drug Labels** — Expandable accordion sections for indications, dosage, warnings, contraindications, adverse reactions, drug interactions, and more
- **Recalls & Enforcement** — Active and historical FDA recalls filterable by status (Ongoing/Completed/Terminated) and classification (Class I/II/III)
- **Barcode Scanner** — Scan a drug's UPC barcode with your phone camera or enter the NDC/UPC code manually to look up any US-registered drug instantly
- **Pagination** — Navigate through large sets of adverse event reports
- **Responsive Design** — Works on desktop, tablet, and mobile
- **XSS Protection** — HTML content from FDA labels is sanitized to prevent cross-site scripting attacks

## APIs Used

### 1. OpenFDA

- **Provider:** U.S. Food and Drug Administration
- **Documentation:** [https://open.fda.gov/apis/](https://open.fda.gov/apis/)
- **Endpoints used:**
  - `/drug/event.json` — Adverse event reports (FAERS database)
  - `/drug/label.json` — Drug labeling (SPL format) and barcode/NDC lookup
  - `/drug/enforcement.json` — Recall and enforcement data
- **What it provides:** Drug adverse events, drug labels, recalls, enforcement actions, barcode-to-drug resolution

### 2. Drug Info and Price History (RapidAPI)

- **Provider:** rnelsomain (via RapidAPI marketplace)
- **Documentation:** [https://rapidapi.com/rnelsomain/api/drug-info-and-price-history](https://rapidapi.com/rnelsomain/api/drug-info-and-price-history)
- **Endpoint used:** `/1/druginfo` — Drug product details
- **What it provides:** Drug details, generic names, active ingredients, manufacturer info, packaging

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Barcode Scanning:** [html5-qrcode](https://github.com/mebjas/html5-qrcode) (supports UPC-A, UPC-E, EAN-13, EAN-8, CODE-128, CODE-39)
- **Font:** [Outfit](https://fonts.google.com/specimen/Outfit) (Google Fonts)
- **Process Manager:** PM2 (for deployment)
- **Reverse Proxy & Load Balancer:** Nginx (round-robin)
- **SSL/HTTPS:** Let's Encrypt via Certbot
- **Firewall:** UFW on all servers

## Prerequisites

- Node.js 18+ and npm
- API keys for OpenFDA and RapidAPI (Drug Info and Price History)

## Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nshizirunguwilson/medsafe.git
   cd medsafe
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

## Deployment to Web Servers

The application is deployed on two web servers behind an Nginx load balancer:

| Server | IP Address | Role |
|--------|-----------|------|
| Web01 | 34.239.0.61 | Application server |
| Web02 | 3.87.217.227 | Application server |
| Lb01 | 3.86.83.174 | Nginx load balancer |

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
git clone https://github.com/nshizirunguwilson/medsafe.git
cd medsafe/backend

# Install dependencies
npm install

# Create the .env file with API keys (use the correct SERVER_ID for each server)
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

You should see: `{"status":"ok","server":"web01","timestamp":"..."}`

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
# Run multiple requests — you should see alternating server IDs (web01 / web02)
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

The application is live at: **https://medsafe.wilsonn.tech**

## Error Handling

- **Loading states:** Animated dot loader displayed during API calls
- **Empty states:** Friendly messages when no results are found, including a banner when all tabs return empty suggesting US drug names
- **API failures:** Graceful fallback — if one API is down, the other tabs still work independently
- **Rate limiting:** Server-side rate limiting (60 requests/minute) with clear error messages
- **Input validation:** Minimum 2-character search query requirement
- **Barcode errors:** Clear feedback when a scanned barcode isn't found, showing the scanned code and a "Scan Again" button to retry
- **Camera fallback:** If camera access is denied or unavailable, the user is prompted to use the manual entry tab instead

## Project Structure

```
medsafe/
├── backend/
│   ├── server.js        # Express server with API proxy routes
│   ├── package.json     # Dependencies and scripts
│   ├── package-lock.json
│   ├── .env             # API keys (not committed)
│   └── .env.example     # Template for environment variables
├── frontend/
│   ├── index.html       # Single-page application
│   ├── styles.css       # All styles
│   ├── app.js           # Client-side JavaScript
│   └── barcodes.html    # Test page with sample drug barcodes
├── .gitignore           # Excludes node_modules, .env
└── README.md            # This file
```

## Challenges & Solutions

1. **OpenFDA search syntax** — The OpenFDA API uses a unique search syntax with `+AND+` operators and date formatting as `YYYYMMDD`. I had to carefully parse and transform user-friendly date inputs into the required format.

2. **Handling multiple API sources** — Each tab fetches data independently, so if one API is down or rate-limited, the others still work. All API calls fire in parallel on search for faster results.

3. **Adverse event data volume** — OpenFDA can return thousands of results. I implemented server-side pagination (capped at 5000 by OpenFDA's skip limit) and client-side sorting to keep the interface responsive.

4. **Secure API key handling** — API keys are stored in `.env` and never exposed to the frontend. The Express server acts as a proxy, making all external API calls server-side.

5. **Barcode-to-drug resolution** — Drug packages use UPC barcodes, but OpenFDA indexes drugs by NDC (National Drug Code). I implemented a multi-strategy conversion: UPC-A to NDC format conversion (stripping check digit and leading zero), direct NDC lookup, and UPC search via the `openfda.upc` field, trying each until a match is found.

6. **XSS protection on FDA labels** — OpenFDA returns raw HTML in drug label fields. I built a sanitizer that strips all unsafe tags and attributes while preserving safe formatting tags like `<b>`, `<p>`, `<ul>`, and `<table>`.

7. **Camera lifecycle on mobile** — The html5-qrcode library requires careful cleanup of the video stream and DOM elements between scans. I implemented a scanning lock flag and proper async cleanup to prevent camera reuse issues on iOS Safari.

## Credits

- **OpenFDA** — U.S. Food and Drug Administration ([open.fda.gov](https://open.fda.gov/))
- **Drug Info and Price History API** — rnelsomain via [RapidAPI](https://rapidapi.com/rnelsomain/api/drug-info-and-price-history)
- **html5-qrcode** — Minhaz ([github.com/mebjas/html5-qrcode](https://github.com/mebjas/html5-qrcode)) — barcode scanning library
- **Outfit Font** — Rodrigo Fuenzalida via [Google Fonts](https://fonts.google.com/specimen/Outfit)

## License

This project was created as an academic assignment. All APIs are used in accordance with their respective terms of service.
