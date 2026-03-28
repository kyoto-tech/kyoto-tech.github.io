export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  const secret = request.headers.get("x-webhook-secret");
  if (!secret || secret !== import.meta.env.WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let message: string;
  try {
    const body = await request.json() as { message: string };
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return new Response("Bad Request: message must be a non-empty string", { status: 400 });
    }
    message = body.message.trim();
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.LINE_CHANNEL_TOKEN}`,
    },
    body: JSON.stringify({
      to: import.meta.env.LINE_TARGET_ID,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!lineRes.ok) {
    const error = await lineRes.text();
    console.error("LINE API error:", lineRes.status, error);
    return new Response("Failed to deliver message to LINE", { status: 502 });
  }

  return new Response("OK", { status: 200 });
}
