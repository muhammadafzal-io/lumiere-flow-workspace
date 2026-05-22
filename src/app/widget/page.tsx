"use client";
import { useState } from "react";

export default function WidgetPage() {
  const [sessionId] = useState(() => String(Math.random()).slice(2));
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);

  async function send() {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
    const data = await res.json();
    setReply(data.reply ?? JSON.stringify(data));
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Chat Widget (demo)</h2>
      <div>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message" />
        <button onClick={send}>Send</button>
      </div>
      {reply && (
        <div style={{ marginTop: 12 }}>
          <strong>Reply:</strong>
          <div>{reply}</div>
        </div>
      )}
    </div>
  );
}
