export type EventType = "coffee" | "hack-day" | "special";

export function classifyEventType(title: string): EventType {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("coffee")) {
    return "coffee";
  }

  if (/\bhack[-\s]+day\b/.test(normalizedTitle)) {
    return "hack-day";
  }

  return "special";
}
