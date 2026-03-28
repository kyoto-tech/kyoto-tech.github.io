/**
 * MemberMap - Specialised map for community members.
 *
 * Handles role-based filtering and passes the filtered GeoJSON to the
 * generic <Map> component for rendering.
 *
 * Props:
 *   geojson   {object}   GeoJSON FeatureCollection (full, unfiltered member data)
 *   features  {string[]} Feature flags:
 *                          "clusters"   - cluster nearby markers
 *                          "roleFilter" - show role/tag filter chips above the map
 *                          "fitBounds"  - auto-zoom to fit all visible markers
 *                          "legend"     - show a colour-coded role legend
 *   lang      {string}   Active locale ("en" | "ja")
 *   labels    {object}   i18n label overrides
 */

import { useMemo, useState } from "react";
import Map from "./Map.jsx";

// -- Role -> colour mapping
const ROLE_COLOURS = {
  "Software Engineer": "#3B82F6",
  Designer: "#8B5CF6",
  Researcher: "#10B981",
  Founder: "#F59E0B",
  Other: "#6B7280",
};

function roleColour(role) {
  return ROLE_COLOURS[role] ?? ROLE_COLOURS.Other;
}

/** Build a Leaflet popup HTML string for a member feature. */
function buildPopupHtml(props, labels) {
  const colour = roleColour(props.role ?? "Other");
  const tags = (props.tags ?? [])
    .map(
      (t) =>
        `<span style="background:#f1f5f9;border-radius:9999px;padding:1px 8px;font-size:11px;color:#475569">${t}</span>`,
    )
    .join(" ");

  const links = [
    props.github
      ? `<a href="https://github.com/${props.github}" target="_blank" rel="noreferrer"
           style="color:#3B82F6;text-decoration:none;font-size:12px">GitHub</a>`
      : null,
    props.website
      ? `<a href="${props.website}" target="_blank" rel="noreferrer"
           style="color:#3B82F6;text-decoration:none;font-size:12px">${labels.website ?? "Website"}</a>`
      : null,
  ]
    .filter(Boolean)
    .join(" - ");

  return `
    <div style="min-width:180px;font-family:sans-serif">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="width:10px;height:10px;border-radius:50%;background:${colour};display:inline-block;flex-shrink:0"></span>
        <strong style="font-size:14px;color:#0f172a">${props.name ?? labels.unknownMember ?? "Member"}</strong>
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:4px">${props.role ?? ""}</div>
      ${props.bio ? `<p style="font-size:12px;color:#334155;margin:0 0 6px">${props.bio}</p>` : ""}
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">${tags}</div>
      ${links ? `<div style="margin-top:4px">${links}</div>` : ""}
    </div>`;
}

// -- Component

export default function MemberMap({
  geojson,
  features = ["fitBounds", "legend"],
  lang = "en",
  labels = {},
}) {
  const enableRoleFilter = features.includes("roleFilter");
  void lang; // accepted for API parity with other map pages; unused here today

  // Strip "roleFilter" before forwarding - Map does not know about it
  const mapFeatures = useMemo(
    () => features.filter((f) => f !== "roleFilter"),
    [features],
  );

  // Collect unique roles present in the data
  const allRoles = useMemo(
    () => [
      ...new Set(
        (geojson?.features ?? []).map((f) => f.properties?.role ?? "Other"),
      ),
    ],
    [geojson],
  );

  const [activeRoles, setActiveRoles] = useState(() => new Set(allRoles));

  // Filtered GeoJSON forwarded to <Map>
  const filteredGeoJSON = useMemo(
    () => ({
      ...geojson,
      features: (geojson?.features ?? []).filter((f) =>
        activeRoles.has(f.properties?.role ?? "Other"),
      ),
    }),
    [geojson, activeRoles],
  );

  // Legend entries from the role colour map (stable reference)
  const legendEntries = useMemo(
    () =>
      Object.entries(ROLE_COLOURS).map(([label, colour]) => ({ label, colour })),
    [],
  );

  // Callbacks for <Map> - Map stores them in refs so stale closure is not an issue
  const getMarkerColour = (feature) =>
    roleColour(feature.properties?.role ?? "Other");

  const renderPopup = (feature) =>
    buildPopupHtml(feature.properties ?? {}, labels);

  // -- Filter chip handlers

  function toggleRole(role) {
    setActiveRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }

  function selectAll() {
    setActiveRoles(new Set(allRoles));
  }

  // -- Render

  return (
    <div className="flex flex-col gap-3">
      {/* Role filter chips */}
      {enableRoleFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={selectAll}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            {labels.filterAll ?? "All"}
          </button>
          {allRoles.map((role) => {
            const active = activeRoles.has(role);
            const colour = roleColour(role);
            return (
              <button
                key={role}
                onClick={() => toggleRole(role)}
                style={
                  active
                    ? { background: colour, borderColor: colour, color: "#fff" }
                    : {}
                }
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-transparent"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                }`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: active ? "#fff" : colour }}
                />
                {role}
              </button>
            );
          })}
        </div>
      )}

      {/* Generic map - receives only the filtered slice of data */}
      <Map
        geojson={filteredGeoJSON}
        features={mapFeatures}
        labels={labels}
        getMarkerColour={getMarkerColour}
        renderPopup={renderPopup}
        legendEntries={legendEntries}
      />
    </div>
  );
}



