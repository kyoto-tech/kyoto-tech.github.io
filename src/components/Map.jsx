/**
 * Map – Generic Leaflet map component.
 *
 * Props:
 *   geojson          {object}    GeoJSON FeatureCollection to render (already filtered by caller).
 *   features         {string[]}  Feature flags:
 *                                  "clusters"  – cluster nearby markers with leaflet.markercluster
 *                                  "fitBounds" – auto-zoom to fit all visible markers
 *                                  "legend"    – show a colour-coded legend overlay
 *   labels           {object}    i18n strings. Supported key: `legendTitle`.
 *   getMarkerColour  {function}  (feature) => CSS colour string. Defaults to grey.
 *   renderPopup      {function}  (feature) => HTML string for the Leaflet popup.
 *                                Defaults to a minimal name/coordinates popup.
 *   legendEntries    {Array}     [{ label: string, colour: string }] shown in the legend.
 *   center           {[lat,lng]} Initial map centre. Defaults to central Kyoto.
 *   zoom             {number}    Initial zoom level. Defaults to 13.
 *   height           {string}    CSS height for the map container. Defaults to "480px".
 */

import { useEffect, useRef } from "react";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a circular SVG DivIcon for a given colour. */
function makeIcon(L, colour) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${colour}" stroke="white" stroke-width="2"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function defaultRenderPopup(feature) {
  const props = feature.properties ?? {};
  const [lng, lat] = feature.geometry?.coordinates ?? [0, 0];
  return `<div style="min-width:160px;font-family:sans-serif">
    <strong style="font-size:14px;color:#0f172a">${props.name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</strong>
  </div>`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Map({
  geojson,
  features = ["fitBounds"],
  labels = {},
  getMarkerColour = () => "#6B7280",
  renderPopup = defaultRenderPopup,
  legendEntries = [],
  center = [35.005, 135.765],
  zoom = 13,
  height = "480px",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  // Keep latest prop callbacks in refs so async renderMarkers always uses
  // the current version without those functions being effect dependencies.
  const geojsonRef = useRef(geojson);
  const getMarkerColourRef = useRef(getMarkerColour);
  const renderPopupRef = useRef(renderPopup);
  geojsonRef.current = geojson;
  getMarkerColourRef.current = getMarkerColour;
  renderPopupRef.current = renderPopup;

  const enableClusters = features.includes("clusters");
  const enableFitBounds = features.includes("fitBounds");
  const enableLegend = features.includes("legend");

  // ── Initialise the map once on mount ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let L;
    let destroyed = false;

    (async () => {
      L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (destroyed) return;

      // Fix default icon paths broken by bundlers
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        center,
        zoom,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Render the initial set of markers
      renderMarkers(L, map);
    })();

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
    // center/zoom are intentionally read once at mount time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-render markers whenever the caller passes new geojson ──────────────
  // (e.g. after a filter is applied in the parent component)
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((mod) => renderMarkers(mod.default, mapRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson]);

  // ── Core marker rendering logic ───────────────────────────────────────────
  async function renderMarkers(L, map) {
    if (!map) return;

    // Remove the previous layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    const featureList = geojsonRef.current?.features ?? [];

    let layer;
    if (enableClusters) {
      const { default: MC } = await import("leaflet.markercluster");
      await import("leaflet.markercluster/dist/MarkerCluster.css");
      await import("leaflet.markercluster/dist/MarkerCluster.Default.css");
      void MC; // imported for side-effects; augments L.markerClusterGroup
      layer = L.markerClusterGroup({ showCoverageOnHover: false });
    } else {
      layer = L.layerGroup();
    }

    const bounds = [];

    for (const feature of featureList) {
      const [lng, lat] = feature.geometry.coordinates;
      const colour = getMarkerColourRef.current(feature);
      const icon = makeIcon(L, colour);
      const marker = L.marker([lat, lng], { icon });

      marker.bindPopup(renderPopupRef.current(feature), { maxWidth: 280 });
      layer.addLayer(marker);
      bounds.push([lat, lng]);
    }

    layer.addTo(map);
    layerRef.current = layer;

    if (enableFitBounds && bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div ref={containerRef} style={{ height, width: "100%" }} />

      {enableLegend && legendEntries.length > 0 && (
        <div className="absolute bottom-4 right-4 z-1000 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-md backdrop-blur-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.legendTitle ?? "Legend"}
          </p>
          <ul className="flex flex-col gap-1.5">
            {legendEntries.map(({ label, colour }) => (
              <li key={label} className="flex items-center gap-2 text-xs text-slate-700">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: colour }}
                />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}





