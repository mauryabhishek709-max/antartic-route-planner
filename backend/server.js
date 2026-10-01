const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');


const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. IN-MEMORY MONGODB & SCHEMA DEFINITION
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Atlas Connected Successfully!'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// Schema for saving calculated voyage logs
const VoyageSchema = new mongoose.Schema({
  vessel_ice_class: { type: Number, default: 1.0 },
  start_coords: { type: [Number], required: true },
  goal_coords: { type: [Number], required: true },
  ice_severity: { type: Number, default: 1.0 },
  route_data: { type: mongoose.Schema.Types.Mixed }, // Stores response from H3 pathfinding service
  createdAt: { type: Date, default: Date.now }
});

const Voyage = mongoose.model('Voyage', VoyageSchema);

// Schema for Iceberg tracking history
const IcebergSchema = new mongoose.Schema({
  icebergId: Number,
  lat: Number,
  lon: Number,
  timestamp: { type: Date, default: Date.now }
});

const IcebergLog = mongoose.model('IcebergLog', IcebergSchema);

// ==========================================
// 2. SOCKET.IO & REAL-TIME ICEBERG TRACKING
// ==========================================
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let icebergs = [
  { id: 1, lat: -64.2, lon: -62.1 },
  { id: 2, lat: -63.5, lon: -61.0 },
  { id: 3, lat: -63.0, lon: -60.2 }
];

setInterval(() => {
  icebergs = icebergs.map(ib => ({
    ...ib,
    lat: Number((ib.lat + (Math.random() - 0.5) * 0.03).toFixed(4)),
    lon: Number((ib.lon + (Math.random() - 0.5) * 0.03).toFixed(4))
  }));
  
  io.emit('icebergUpdate', icebergs);
}, 3000);

io.on('connection', (socket) => {
  console.log(`Client Connected: ${socket.id}`);
  socket.emit('icebergUpdate', icebergs);
  
  socket.on('disconnect', () => {
    console.log(`Client Disconnected: ${socket.id}`);
  });
});

// ==========================================
// 3. API ENDPOINTS (MONGODB & PATHFINDING)
// ==========================================

// POST Endpoint: Directly save voyage log to MongoDB
app.post('/api/voyages', async (req, res) => {
  try {
    const voyage = new Voyage(req.body);
    await voyage.save();
    res.status(201).json({ success: true, data: voyage });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST Endpoint: Calculate H3 Route and persist log into MongoDB
app.post('/api/route/calculate', async (req, res) => {
  try {
    const { vessel_ice_class, start_coords, goal_coords, ice_severity } = req.body;
    const icebergCoords = icebergs.map(ib => [ib.lat, ib.lon]);

    // Forward pathfinding request to Python engine
    const response = await axios.post('http://127.0.0.1:8000/calculate-h3-route', {
      start_lat: start_coords ? start_coords[0] : -64.8,
      start_lon: start_coords ? start_coords[1] : -63.5,
      goal_lat: goal_coords ? goal_coords[0] : -62.2,
      goal_lon: goal_coords ? goal_coords[1] : -58.9,
      iceberg_latlons: icebergCoords,
      vessel_ice_class: vessel_ice_class ? parseFloat(vessel_ice_class) : 1.0,
      ice_severity: ice_severity ? parseFloat(ice_severity) : 1.0
    });

    // Save calculation entry to MongoDB
    const newVoyage = new Voyage({
      vessel_ice_class: vessel_ice_class || 1.0,
      start_coords: start_coords || [-64.8, -63.5],
      goal_coords: goal_coords || [-62.2, -58.9],
      ice_severity: ice_severity || 1.0,
      route_data: response.data
    });

    await newVoyage.save();

    // Return combined result along with saved mongo DB ID
    res.json({
      success: true,
      voyage_id: newVoyage._id,
      ...response.data
    });

  } catch (error) {
    console.error("Pathfinding error:", error.message);
    res.status(500).json({ status: 'error', message: 'H3 Pathfinding failed' });
  }
});

// GET Endpoint: Fetch all saved voyage histories from MongoDB
app.get('/api/voyages', async (req, res) => {
  try {
    const voyages = await Voyage.find().sort({ createdAt: -1 });
    res.json({ success: true, count: voyages.length, data: voyages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET Endpoint: Fetch single voyage by ID
app.get('/api/voyages/:id', async (req, res) => {
  try {
    const voyage = await Voyage.findById(req.params.id);
    if (!voyage) return res.status(404).json({ success: false, message: 'Voyage not found' });
    res.json({ success: true, data: voyage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Node Gateway on port ${PORT}`));