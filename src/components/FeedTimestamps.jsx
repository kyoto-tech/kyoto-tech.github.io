import { FaCheckCircle, FaArrowRight } from "react-icons/fa";

/**
 * Renders "last updated" and "next update" times in the visitor's local
 * timezone. Runs client-side so the times are always correct regardless of
 * where the static build was generated.
 *
 * @param {Object}  props
 * @param {string}  props.generatedAt     - ISO 8601 timestamp from composite-feed.json
 * @param {number}  props.intervalHours   - Hours until next update (default 3)
 * @param {string}  props.updatedLabel    - Localised "Last updated" label
 * @param {string}  props.nextLabel       - Localised "Next update" label
 */
export default function FeedTimestamps({
  generatedAt,
  intervalHours = 3,
  updatedLabel,
  nextLabel,
}) {
  if (!generatedAt) return null;

  const generated = new Date(generatedAt);
  if (isNaN(generated.valueOf())) return null;

  const next = new Date(generated);
  next.setHours(next.getHours() + intervalHours);

  const fmt = (date) =>
    date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <span className="inline-flex items-center gap-1">
        <FaCheckCircle className="text-(--accent)" aria-hidden="true" />
        <span>
          {updatedLabel}: {fmt(generated)}
        </span>
      </span>
      <span className="inline-flex items-center gap-1">
        <FaArrowRight className="text-(--accent)" aria-hidden="true" />
        <span>
          {nextLabel}: {fmt(next)}
        </span>
      </span>
    </div>
  );
}
