export default function EventList({ events }) {
  if (!events || events.length === 0) {
    return <p className=" mt3 text-gray-500 italic">Check back soon for events! <a href="https://www.meetup.com/ja-JP/kyoto-tech-meetup"> Join our meetup group here to get updates.</a></p>;
  }

  return (
    <ul className="space-y-6">
      {events.map(event => (
        <li key={event.link} className="p-4 border rounded-xl shadow-sm">
          <a
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xl font-semibold text-blue-600 hover:underline"
          >
            {event.title}
          </a>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(event.pubDate).toLocaleString()}
          </p>
          <div
            className="prose prose-sm mt-2"
            dangerouslySetInnerHTML={{ __html: event.description }}
          />
        </li>
      ))}
    </ul>
  );
}
