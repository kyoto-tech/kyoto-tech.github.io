export default function EventList({ events, lang = "en", labels = {} }) {
  const dateLocale = lang === "ja" ? "ja-JP" : "en-US";
  const l = {
    empty: labels.empty || "Check back soon for events!",
    emptyLink: labels.emptyLink || "Join our meetup group here to get updates.",
    liveNow: labels.liveNow || "Live Now",
    venueTba: labels.venueTba || "Venue TBA",
    going: labels.going || "going",
  };
  const now = new Date();
  const LIVE_GRACE_MS = 4 * 60 * 60 * 1000; // match the server-side in-progress window

  const isLive = evt => {
    const start = new Date(evt.start);
    const end = evt.endTime ? new Date(evt.endTime) : null;
    if (end) {
      return start <= now && end >= now;
    }
    return start <= now && now - start <= LIVE_GRACE_MS;
  };

  if (!events || events.length === 0) {
    return <p className=" mt3 text-gray-500 italic">{l.empty} <a href="https://www.meetup.com/ja-JP/kyoto-tech-meetup"> {l.emptyLink}</a></p>;
  }

  // Group by month string (using Tokyo timezone for consistency)
  const groups = events.reduce((acc, evt) => {
    const d = new Date(evt.start);
    const monthLabel = d.toLocaleString(dateLocale, {
      timeZone: "Asia/Tokyo",
      month: "long",
      year: "numeric"
    });
    acc[monthLabel] = acc[monthLabel] || [];
    acc[monthLabel].push(evt);
    return acc;
  }, {});

  const orderedMonths = events
    .map(evt => {
      const d = new Date(evt.start);
      const monthLabel = d.toLocaleString(dateLocale, {
        timeZone: "Asia/Tokyo",
        month: "long",
        year: "numeric"
      });
      return { monthLabel, date: d };
    })
    .reduce((seen, curr) => {
      if (!seen.find(item => item.monthLabel === curr.monthLabel)) {
        seen.push(curr);
      }
      return seen;
    }, [])
    .sort((a, b) => a.date - b.date)
    .map(item => item.monthLabel);

  return (
    <>
      <style>{`
        @keyframes liveBorderPulse {
          0% { box-shadow: 0 0 0 0 var(--accent); }
          60% { box-shadow: 0 0 0 12px rgba(0, 0, 0, 0); }
          100% { box-shadow: 0 0 0 12px rgba(0, 0, 0, 0); }
        }
        .live-border {
          animation: liveBorderPulse 1.8s ease-out infinite;
        }
      `}</style>
      <div className="space-y-8">
      {orderedMonths.map(monthLabel => (
        <div key={monthLabel} className="space-y-4">
          <h3 className="text-2xl font-semibold text-slate-900">{monthLabel}</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {groups[monthLabel].map(event => (
              <li key={event.link}>
                {(() => {
                  const live = isLive(event);
                  const baseCardClasses = "p-4 border rounded-xl shadow-sm flex gap-4 items-start md:items-center block hover:shadow-md transition-shadow no-underline h-full relative";
                  const cardClasses = live ? `${baseCardClasses} live-border` : baseCardClasses;
                  return (
                    <a
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardClasses}
                      style={{
                        color: "var(--accent)",
                        textDecoration: "none",
                        borderColor: "var(--accent)"
                      }}
                    >
                      {live ? (
                        <span
                          className="absolute left-4 top-3 z-10 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] shadow-md"
                          style={{ backgroundColor: "var(--accent)", color: "white", pointerEvents: "none" }}
                        >
                          <span className="inline-block h-2 w-2 rounded-full bg-white" aria-hidden="true" />
                          {l.liveNow}
                        </span>
                      ) : null}
                      {event.image ? (
                        <div className="w-1/3 min-w-[120px] relative">
                          <img
                            src={event.image}
                            alt={event.title}
                            className="w-full h-full max-h-32 rounded-lg object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="text-xl font-semibold">
                          {event.title}
                        </div>
                        <p className="text-sm text-gray-500 mt-1 space-x-2">
                          <span>
                            {new Date(event.start).toLocaleString(dateLocale, {
                              timeZone: "Asia/Tokyo",
                              month: "long",
                              day: "numeric",
                              year: "numeric"
                            })}
                          </span>
                          <span className="text-gray-400">•</span>
                          <span>
                            {new Date(event.start).toLocaleTimeString(dateLocale, {
                              timeZone: "Asia/Tokyo",
                              hour12: false,
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                            {event.endTime
                              ? ` – ${new Date(event.endTime).toLocaleTimeString(dateLocale, {
                                  timeZone: "Asia/Tokyo",
                                  hour12: false,
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}`
                              : ""}
                          </span>
                        </p>
                        <div className="text-sm text-gray-700 mt-2 space-y-1">
                          <div className="font-medium text-slate-900">
                            {event.venue?.name ?? l.venueTba}
                          </div>
                          {event.venue?.address ? (
                            <div className="text-gray-600">{event.venue.address}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-gray-600">
                          <span>{event.goingCount ?? 0} {l.going}</span>
                        </div>
                      </div>
                    </a>
                  );
                })()}
              </li>
            ))}
          </ul>
        </div>
      ))}
      </div>
    </>
  );
}
