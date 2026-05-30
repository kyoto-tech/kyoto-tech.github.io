import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";

export default function FullCalendarView({ events, range, lang = "en" }) {
  return (
    <div className="kt-calendar">
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridFiveWeek"
        initialDate={range.start}
        timeZone="Asia/Tokyo"
        locale={lang === "ja" ? "ja" : "en"}
        firstDay={1}
        height="auto"
        fixedWeekCount={false}
        dayMaxEvents={3}
        eventDisplay="block"
        displayEventTime={false}
        headerToolbar={{
          left: "",
          center: "",
          right: "",
        }}
        eventTimeFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
        views={{
          dayGridFiveWeek: {
            type: "dayGrid",
            visibleRange: range,
          },
        }}
        events={events}
      />
    </div>
  );
}
