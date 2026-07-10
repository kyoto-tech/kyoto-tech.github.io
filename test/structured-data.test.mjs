import { describe, expect, test } from "vitest";
import {
  buildEventStructuredData,
  serializeJsonLd,
} from "../src/lib/structured-data.ts";

const event = {
  title: "Morning Tech & Coffee",
  link: "https://www.meetup.com/kyoto-tech-meetup/events/example/",
  start: "2026-07-18T09:30:00+09:00",
  endTime: "2026-07-18T10:30:00+09:00",
  description: "",
  image: "https://secure.meetupstatic.com/example.jpeg",
  goingCount: 8,
  interestedCount: 14,
  eventType: "coffee",
  venue: {
    name: "Starbucks Karasuma Shijo",
    address: "Shijo-dori, Kyoto",
    city: "Kyoto",
    country: "JP",
  },
};

describe("event structured data", () => {
  test("builds complete upcoming Event records", () => {
    expect(buildEventStructuredData([event], "https://kyototechmeetup.com"))
      .toMatchObject([
        {
          "@type": "Event",
          name: "Morning Tech & Coffee",
          startDate: event.start,
          location: {
            "@type": "Place",
            name: "Starbucks Karasuma Shijo",
          },
          organizer: { "@id": "https://kyototechmeetup.com/#org" },
        },
      ]);
  });

  test("omits incomplete or unsafe records", () => {
    expect(
      buildEventStructuredData(
        [{ ...event, link: "javascript:alert(1)" }, { ...event, venue: null }],
        "https://kyototechmeetup.com",
      ),
    ).toEqual([]);
  });

  test("escapes closing script sequences in JSON-LD", () => {
    const serialized = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("<script");
    expect(JSON.parse(serialized).name).toBe("</script><script>alert(1)</script>");
  });
});
