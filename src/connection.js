const MAX_DELAY = 30000;
const HEARTBEAT_MS = 25000;

export class NotificationConnection {
  constructor(url, onStatus, onMessage) { this.url = url; this.onStatus = onStatus; this.onMessage = onMessage; this.queue = []; this.seen = new Set(); this.attempt = 0; this.closed = false; }
  connect() {
    if (this.closed || !navigator.onLine || !this.url) return;
    this.onStatus(this.attempt ? "reconnecting" : "connecting");
    try { this.socket = new WebSocket(this.url); } catch { this.reconnect(); return; }
    this.socket.onopen = () => { this.attempt = 0; this.onStatus("connected"); this.flush(); this.heartbeat = setInterval(() => this.send({ type: "ping", id: crypto.randomUUID() }), HEARTBEAT_MS); };
    this.socket.onmessage = (event) => { try { const message = JSON.parse(event.data); if (message.id && this.seen.has(message.id)) return; if (message.id) { this.seen.add(message.id); if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value); } this.onMessage(message); } catch { /* Ignore malformed server packets. */ } };
    this.socket.onclose = () => { clearInterval(this.heartbeat); this.reconnect(); };
    this.socket.onerror = () => this.socket?.close();
  }
  send(message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); else this.queue.push(message); }
  flush() { const queued = this.queue.splice(0); queued.forEach((message) => this.send(message)); }
  reconnect() { if (this.closed || !navigator.onLine) { this.onStatus("offline"); return; } const delay = Math.min(MAX_DELAY, 1000 * 2 ** this.attempt) + Math.random() * 350; this.attempt += 1; this.onStatus("reconnecting"); clearTimeout(this.timer); this.timer = setTimeout(() => this.connect(), delay); }
  close() { this.closed = true; clearInterval(this.heartbeat); clearTimeout(this.timer); this.socket?.close(); }
}
