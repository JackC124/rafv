const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static("public"));

const PORT = 3000;
const IVAO_URL = "https://api.ivao.aero/v2/tracker/whazzup";
const API_KEY = "KPUQ9I00Q43ETMDNI90DE4T3QRDRXCEI";
const LOG_FILE = path.join(__dirname, "flight_log.json");

let cachedAircraft = [];
let lastFetch = 0;
const REFRESH_INTERVAL = 15000; // 15 seconds

// Initialize log file if missing
if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "{}");

async function fetchIVAO() {
  try {
    const response = await axios.get(IVAO_URL, {
      headers: {
        "User-Agent": "QRA-Map",
        "Authorization": `Bearer ${API_KEY}`,
        "Accept": "application/json"
      }
    });

    const data = response.data;
    const pilots = data.clients?.pilots || [];

    cachedAircraft = pilots
      .filter(p => p.lastTrack?.latitude && p.lastTrack?.longitude)
      .map(pilot => ({
        callsign: pilot.callsign,
        lat: pilot.lastTrack.latitude,
        lon: pilot.lastTrack.longitude,
        altitude: pilot.lastTrack.altitude,
        speed: pilot.lastTrack.groundSpeed,
        heading: pilot.lastTrack.heading,
        departure: pilot.flightPlan?.departureId || "",
        arrival: pilot.flightPlan?.arrivalId || "",
        aircraft: pilot.flightPlan?.aircraftId || "",
        transponder: pilot.lastTrack.transponder || "",
        transponderMode: pilot.lastTrack.transponderMode || ""
      }));

    lastFetch = Date.now();
    console.log(`Loaded ${cachedAircraft.length} aircraft`);

    // Log positions to flight_log.json
    const logData = JSON.parse(fs.readFileSync(LOG_FILE));

    cachedAircraft.forEach(ac => {
      if (!logData[ac.callsign]) logData[ac.callsign] = [];
      logData[ac.callsign].push({
        lat: ac.lat,
        lon: ac.lon,
        heading: ac.heading,
        altitude: ac.altitude,
        speed: ac.speed,
        transponder: ac.transponder,
        transponderMode: ac.transponderMode,
        timestamp: Date.now()
      });
    });

    fs.writeFileSync(LOG_FILE, JSON.stringify(logData, null, 2));

  } catch (err) {
    console.error("IVAO ERROR:", err.response?.status || err.message);
    cachedAircraft = [];
  }
}

// Endpoint for latest aircraft (for live markers)
app.get("/api/aircraft", async (req, res) => {
  if (Date.now() - lastFetch > REFRESH_INTERVAL) {
    await fetchIVAO();
  }
  res.json(cachedAircraft);
});

// Endpoint for flight history
app.get("/api/flightpaths", (req, res) => {
  const logData = JSON.parse(fs.readFileSync(LOG_FILE));
  res.json(logData);
});

app.listen(PORT, () => {
  console.log(`🚀 QRA-Map running at http://localhost:${PORT}`);
  fetchIVAO();
});
