// --- State ---
let map;
let isUnderground = false;
const loadedRealTrackExtents = [];
const lineDataCache = {}; // Cache for station lists: { lineCd: { ...data } }

// External Data Cache
let externalLineData = {}; // Map<LineName, { color, logo, company }>

// GeoJSON Data Store
let geojsonData = {
    type: 'FeatureCollection',
    features: []
};

// Overpass State
let isOverpassLoading = false;
let overpassDebounceTimer = null;

// Station Registry for Merging
const stationRegistry = new Map(); // Key: Name, Value: { lat, lon, modes: Set(), lines: [], featureIndex: number }

// --- Editing State ---
let isEditMode = false;
let draftLine = {
    points: [], // Array of [lon, lat]
    stations: [], // Array of { name, lon, lat }
    markers: [] // Array of maplibregl.Marker
};
