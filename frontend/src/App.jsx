import React, { useState, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Polyline, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icon URLs in bundled React apps
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Custom DivIcons for map entities
const vesselIcon = new L.DivIcon({
  html: `<div style="font-size: 26px; transform: translate(-50%, -50%);">🚢</div>`,
  className: 'vessel-marker',
  iconSize: [30, 30]
});

const stationIcon = new L.DivIcon({
  html: `<div style="font-size: 22px; transform: translate(-50%, -50%);">📍</div>`,
  className: 'station-marker',
  iconSize: [25, 25]
});

const icebergIcon = new L.DivIcon({
  html: `<div style="font-size: 26px; transform: translate(-50%, -50%);">🧊</div>`,
  className: 'iceberg-marker',
  iconSize: [30, 30]
});

const ANTARCTIC_STATIONS = [
  { name: "Palmer Station (US)", coords: [-64.77, -64.05] },
  { name: "King Sejong Station (KR)", coords: [-62.22, -58.78] },
  { name: "Rothera Research Station (UK)", coords: [-67.57, -68.13] },
  { name: "Esperanza Base (AR)", coords: [-63.40, -56.99] }
];

const ROUTE_COLORS = {
  fastest: '#ef4444', // Red
  eco: '#10b981',     // Green
  safest: '#38bdf8'   // Blue
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL !== undefined ? import.meta.env.VITE_API_BASE_URL : '';

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function AntarcticDSS() {
  const [severity, setSeverity] = useState(1.5);
  const [vesselIceClass, setVesselIceClass] = useState(1.0);
  const [startIdx, setStartIdx] = useState(0);
  const [goalIdx, setGoalIdx] = useState(1);
  const [selectedProfile, setSelectedProfile] = useState('fastest');
  
  const [routeData, setRouteData] = useState(null);
  const [icebergs, setIcebergs] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [vesselPos, setVesselPos] = useState(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [telemetry, setTelemetry] = useState({ distRemaining: 0, hoursRemaining: 0, fuelRemaining: 0 });
  const animRef = useRef(null);

  const handleMapClick = (coords) => {
    setIcebergs((prev) => [...prev, coords]);
  };

  const clearIcebergs = () => {
    setIcebergs([]);
  };

  const calculateRoute = async () => {
    try {
      if (isSimulating) stopVoyage();

      const start = ANTARCTIC_STATIONS[startIdx].coords;
      const goal = ANTARCTIC_STATIONS[goalIdx].coords;

      const res = await axios.post(`${API_BASE_URL}/calculate-h3-route`, {
        start_coords: start,
        goal_coords: goal,
        vessel_ice_class: vesselIceClass,
        ice_severity: severity,
        icebergs: icebergs
      });

      if (res.data.status === 'success') {
        setRouteData(res.data);
        const activeRoute = res.data.routes[selectedProfile];
        setVesselPos(activeRoute.path[0]);
        setCurrentStepIndex(0);
        setTelemetry({
          distRemaining: activeRoute.distance_nm,
          hoursRemaining: activeRoute.est_hours,
          fuelRemaining: activeRoute.fuel_tons
        });
      }
    } catch (err) {
      console.error("Route calculation error:", err);
    }
  };

  const handleProfileChange = (mode) => {
    setSelectedProfile(mode);
    if (!routeData?.routes?.[mode]) return;
    
    if (isSimulating) stopVoyage();
    
    const activeRoute = routeData.routes[mode];
    setVesselPos(activeRoute.path[0]);
    setCurrentStepIndex(0);
    setTelemetry({
      distRemaining: activeRoute.distance_nm,
      hoursRemaining: activeRoute.est_hours,
      fuelRemaining: activeRoute.fuel_tons
    });
  };

  const startVoyage = () => {
    const activeRoute = routeData?.routes?.[selectedProfile];
    if (!activeRoute?.path || activeRoute.path.length < 2) return;
    
    setIsSimulating(true);

    const path = activeRoute.path;
    let index = currentStepIndex;
    const totalSteps = path.length;

    animRef.current = setInterval(() => {
      index++;
      if (index < totalSteps) {
        setVesselPos(path[index]);
        setCurrentStepIndex(index);

        const fraction = (totalSteps - index) / totalSteps;
        setTelemetry({
          distRemaining: (activeRoute.distance_nm * fraction).toFixed(1),
          hoursRemaining: (activeRoute.est_hours * fraction).toFixed(1),
          fuelRemaining: (activeRoute.fuel_tons * fraction).toFixed(1)
        });
      } else {
        stopVoyage();
      }
    }, 800);
  };

  const stopVoyage = () => {
    if (animRef.current) clearInterval(animRef.current);
    setIsSimulating(false);
  };

  const exportVoyageLog = async () => {
    const activeRoute = routeData?.routes?.[selectedProfile];
    if (!activeRoute) return;

    const payload = {
      timestamp: new Date().toISOString(),
      origin: ANTARCTIC_STATIONS[startIdx].name,
      destination: ANTARCTIC_STATIONS[goalIdx].name,
      profile: selectedProfile,
      ice_severity: severity,
      distance_nm: activeRoute.distance_nm,
      est_hours: activeRoute.est_hours,
      fuel_tons: activeRoute.fuel_tons,
      path: activeRoute.path
    };

    try {
      const res = await axios.post(`${API_BASE_URL}/api/voyage/export-csv`, payload, {
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `voyage_log_${selectedProfile}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("CSV Export error:", err);
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#0f172a', color: '#fff', position: 'relative' }}>
      
      {/* Control Sidebar */}
      <div style={{ width: '340px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 1000, backgroundColor: '#1e293b' }}>
        <h2>Antarctic Navigation DSS</h2>
        
        <label style={{ fontSize: '13px', color: '#94a3b8' }}>Origin Station:</label>
        <select value={startIdx} onChange={(e) => setStartIdx(Number(e.target.value))} style={{ padding: '8px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #334155' }}>
          {ANTARCTIC_STATIONS.map((st, i) => <option key={i} value={i}>{st.name}</option>)}
        </select>

        <label style={{ fontSize: '13px', color: '#94a3b8' }}>Destination Station:</label>
        <select value={goalIdx} onChange={(e) => setGoalIdx(Number(e.target.value))} style={{ padding: '8px', backgroundColor: '#0f172a', color: '#fff', border: '1px solid #334155' }}>
          {ANTARCTIC_STATIONS.map((st, i) => <option key={i} value={i}>{st.name}</option>)}
        </select>

        <label style={{ fontSize: '13px', color: '#94a3b8' }}>Ice Severity: {severity}x</label>
        <input type="range" min="0.3" max="2.0" step="0.1" value={severity} onChange={(e) => setSeverity(parseFloat(e.target.value))} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Iceberg Hazards: {icebergs.length}</span>
          <button onClick={clearIcebergs} style={{ padding: '4px 8px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            Clear Icebergs
          </button>
        </div>

        <button onClick={calculateRoute} style={{ padding: '10px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          Calculate Multi-Routes
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={isSimulating ? stopVoyage : startVoyage} disabled={!routeData} style={{ flex: 1, padding: '10px', backgroundColor: !routeData ? '#334155' : isSimulating ? '#dc2626' : '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {isSimulating ? 'Pause Voyage' : 'Start Voyage'}
          </button>
        </div>

        {routeData && (
          <div style={{ padding: '15px', backgroundColor: '#0f172a', borderRadius: '6px', fontSize: '13px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#38bdf8' }}>ROUTE PROFILES</h3>
            
            {/* Multi-Objective Mode Selector */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '12px' }}>
              {['fastest', 'eco', 'safest'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleProfileChange(mode)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    backgroundColor: selectedProfile === mode ? ROUTE_COLORS[mode] : '#334155',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}>
                  {mode}
                </button>
              ))}
            </div>

            {/* Live Telemetry Display */}
            <div>Distance Remaining: <b>{telemetry.distRemaining} NM</b></div>
            <div>Transit Time Remaining: <b>{telemetry.hoursRemaining} hrs</b></div>
            <div>Fuel Remaining: <b>{telemetry.fuelRemaining} Tons</b></div>

            <button 
              onClick={exportVoyageLog} 
              style={{
                marginTop: '12px',
                width: '100%',
                padding: '8px',
                backgroundColor: '#0284c7',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
              📊 Export Voyage Log (CSV)
            </button>
          </div>
        )}
      </div>

      {/* Map Container */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={[-63.5, -61.0]} zoom={6} style={{ width: '100%', height: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapClickHandler onMapClick={handleMapClick} />
          
          {/* Station Markers */}
          {ANTARCTIC_STATIONS.map((st, idx) => (
            <Marker key={idx} position={st.coords} icon={stationIcon}>
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span style={{ fontWeight: 'bold' }}>{st.name}</span>
              </Tooltip>
            </Marker>
          ))}

          {/* Iceberg Hazard Markers */}
          {icebergs.map((pos, idx) => (
            <Marker key={idx} position={pos} icon={icebergIcon}>
              <Tooltip direction="top">Iceberg Hazard #{idx + 1}</Tooltip>
            </Marker>
          ))}

          {/* H3 Grid Polygons */}
          {routeData?.grid_polygons?.map((poly) => (
            <Polygon 
              key={poly.hex_id} 
              positions={poly.boundary} 
              pathOptions={{
                color: poly.is_hazard ? '#ef4444' : poly.ice_density > 50 ? '#0284c7' : '#22d3ee',
                fillColor: poly.is_hazard ? '#f87171' : poly.ice_density > 50 ? '#0369a1' : '#a5f3fc',
                fillOpacity: poly.is_hazard ? 0.7 : Math.max(0.25, poly.ice_density / 150),
                weight: poly.is_hazard ? 1.5 : 0.5
              }} 
            >
              <Tooltip sticky>
                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  <strong>Hex ID:</strong> {poly.hex_id}<br />
                  <strong>Lat/Lng:</strong> {poly.lat}, {poly.lng}<br />
                  <strong>Ice Density:</strong> {poly.ice_density}%<br />
                  <strong>Fuel Burn:</strong> {poly.fuel_burn_rate} Tons/hr<br />
                  {poly.is_hazard && <span style={{ color: 'red', fontWeight: 'bold' }}>DANGER: ICEBERG ZONE</span>}
                </div>
              </Tooltip>
            </Polygon>
          ))}

          {/* Multi-Objective Path PolyLines */}
          {routeData?.routes && Object.entries(routeData.routes).map(([mode, r]) => (
            <Polyline 
              key={mode}
              positions={r.path} 
              pathOptions={{ 
                color: ROUTE_COLORS[mode], 
                weight: selectedProfile === mode ? 5 : 2, 
                opacity: selectedProfile === mode ? 1.0 : 0.35 
              }} 
            />
          ))}

          {/* Animated Vessel Marker */}
          {vesselPos && <Marker position={vesselPos} icon={vesselIcon} />}
        </MapContainer>
      </div>
    </div>
  );
}