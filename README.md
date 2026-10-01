# 🧊 Antarctic Navigation DSS (Decision Support System)

An intelligent route optimization and decision-support system designed for polar maritime navigation around the Antarctic Peninsula. Powered by Uber's **H3 Hexagonal Spatial Indexing**, satellite sea-ice datasets (`antarctic_ice.nc`), dynamic iceberg hazard avoidance, and an optimized $A^*$ pathfinding engine.

---

## 🌟 Key Features

- **H3 Hexagonal Spatial Indexing**: High-precision discrete global grid system representation for polar regions.
- **Satellite Sea-Ice Integration**: Real-time extraction of ice concentration data from NetCDF satellite observations.
- **Multi-Objective Routing Profiles**:
  - 🔴 **Fastest**: Balances ice friction with vessel speed for minimum transit duration.
  - 🟢 **Eco**: Minimizes fuel burn rate and operational emissions.
  - 🔵 **Safest**: Prioritizes lowest ice density and maximum obstacle clearance around iceberg hazards.
- **Interactive Antarctic Map**:
  - Station selector (Palmer Station, King Sejong Station, Rothera Research Station, Esperanza Base).
  - Dynamic iceberg placement via direct map clicks.
  - Real-time ice density heatmaps with telemetry inspection.
  - Animated vessel voyage simulation.
  - One-click CSV export of full navigational voyage logs.

---

## 🏗️ Architecture

```
antarctic-route-planner/
├── backend/
│   ├── api_engine.py         # Flask & H3 pathfinding engine + static frontend server
│   ├── load_real_sat_data.py # NetCDF sea-ice data loader
│   ├── antarctic_ice.nc      # Satellite sea-ice observation dataset
│   ├── requirements.txt      # Python dependencies
│   ├── server.js             # Optional Node/Express & Socket.io service
│   └── package.json
├── frontend/
│   ├── src/                  # React + Leaflet + Vite frontend application
│   ├── dist/                 # Pre-built production bundle
│   ├── package.json
│   └── vite.config.js
├── Dockerfile                # Production multi-stage Docker container
├── render.yaml               # 1-Click Render.com deployment blueprint
├── Procfile                  # Railway / Heroku process declaration
├── requirements.txt          # Root Python dependencies
└── README.md
```

---

## 🚀 Live Deployment Options

### Option 1: Render (Recommended - Free & Easy)
1. Fork or push this repository to your GitHub account: `https://github.com/mauryabhishek709-max/antartic-route-planner`
2. Go to [Render.com](https://dashboard.render.com/) and click **New > Web Service**.
3. Connect your repository.
4. Render will automatically detect `render.yaml` or you can manually configure:
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt && cd frontend && npm install && npm run build`
   - **Start Command**: `cd backend && python api_engine.py`
5. Click **Deploy Web Service** to get your live `https://<your-app>.onrender.com` link.

### Option 2: Railway
1. Go to [Railway.app](https://railway.app/).
2. Select **Deploy from GitHub repo** and pick `antartic-route-planner`.
3. Railway automatically detects `Dockerfile` or `Procfile` and deploys both backend and frontend.

### Option 3: Docker
```bash
# Build the image
docker build -t antarctic-route-planner .

# Run the container
docker run -p 8000:8000 antarctic-route-planner
```
Access at `http://localhost:8000`.

---

## 💻 Local Development Setup

### 1. Prerequisites
- Python 3.10+
- Node.js 18+

### 2. Backend Setup
```bash
cd backend
pip install -r requirements.txt
python api_engine.py
```
Backend runs on `http://localhost:8000`.

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173` and proxies API requests to `http://localhost:8000`.

---

## 📡 API Endpoints

- `POST /calculate-h3-route`: Computes multi-profile routes and H3 hexagonal polygons.
- `POST /api/voyage/export-csv`: Generates and downloads a voyage log in CSV format.
- `GET /`: Serves the interactive React web dashboard.

---

## 📄 License
MIT License
