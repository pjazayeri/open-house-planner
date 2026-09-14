/**
 * Basemap for every Leaflet map in the app.
 *
 * tile.openstreetmap.org is a volunteer-run server that throttles/queues
 * requests; on phones the map sat grey for 5–10 s on a cold load. Esri's
 * World Street Map tiles are CDN-served, need no API key (CARTO's free tiles
 * now watermark "API KEY REQUIRED"), and zoom to 19 for house-level detail.
 * Note Esri's path order is {z}/{y}/{x}.
 */
export const BASEMAP_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
export const BASEMAP_MAX_ZOOM = 19;
export const BASEMAP_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Shared TileLayer options: keep more tiles cached around the viewport so
 *  panning on a phone reveals already-loaded tiles instead of grey. */
export const BASEMAP_TILE_OPTIONS = {
  maxZoom: BASEMAP_MAX_ZOOM,
  keepBuffer: 4,
  updateWhenIdle: false,
} as const;
