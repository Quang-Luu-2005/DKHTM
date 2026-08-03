import { randomUUID } from "node:crypto";

const clients = new Set();
const history = [];
const maxHistory = 100;

function encode(event) {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function publish(type, data) {
  const event = { id: `event_${randomUUID()}`, type, occurredAt: new Date().toISOString(), data };
  history.push(event);
  if (history.length > maxHistory) history.shift();
  const frame = encode(event);
  for (const client of clients) client.write(frame);
  return event;
}

export function openEventStream(req, res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const lastEventId = req.get("Last-Event-ID");
  if (lastEventId) {
    const index = history.findIndex(event => event.id === lastEventId);
    if (index >= 0) history.slice(index + 1).forEach(event => res.write(encode(event)));
  }

  clients.add(res);
  res.write(`event: connected\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString() })}\n\n`);
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

export function connectedClientCount() {
  return clients.size;
}
