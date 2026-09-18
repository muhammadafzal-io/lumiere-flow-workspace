import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the factory below (which vitest lifts above the imports) can see it.
const { runAgent } = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock("@/lib/agent", () => ({ runAgent }));

import { POST } from "../route";
import { USER_MESSAGE_HARD_LIMIT_TOKENS } from "@/lib/agent/message-limits";

function request(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function post(body: unknown) {
  // The handler only reads standard Request members, so a plain Request is enough here and keeps
  // the test independent of Next's server runtime.
  return POST(request(body) as never);
}

const longMessage = "word ".repeat(USER_MESSAGE_HARD_LIMIT_TOKENS + 200);

describe("POST /api/chat message size guard", () => {
  beforeEach(() => {
    runAgent.mockReset();
    runAgent.mockResolvedValue({ text: "ok", escalated: false, booked: false, messages: [] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("passes an ordinary booking message through to the agent", async () => {
    const res = await post({
      sessionId: "s1",
      message: "I want to book Botox tomorrow at 3 PM.",
      history: [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reply: "ok" });
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it("passes an availability question through unchanged", async () => {
    const res = await post({ sessionId: "s1", message: "any slots friday?", history: [] });
    expect(res.status).toBe(200);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent.mock.calls[0][0]).toMatchObject({
      userMessage: "any slots friday?",
      platform: "widget",
    });
  });

  it("passes a 'yup' confirmation through with its history intact", async () => {
    const history = [
      { role: "user", content: "book it" },
      { role: "assistant", content: "Shall I confirm Friday 2 PM?" },
    ];
    const res = await post({ sessionId: "s1", message: "yup", history });
    expect(res.status).toBe(200);
    expect(runAgent.mock.calls[0][0]).toMatchObject({ userMessage: "yup", history });
  });

  it("rejects a message over the hard limit", async () => {
    const res = await post({ sessionId: "s1", message: longMessage, history: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "MESSAGE_TOO_LONG",
      message:
        "Your message is too long. Please send a shorter message with only the information needed for your request.",
    });
  });

  it("never calls the agent — and so never OpenAI — for a rejected message", async () => {
    await post({ sessionId: "s1", message: longMessage, history: [] });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("does not leak the token count to the client", async () => {
    const res = await post({ sessionId: "s1", message: longMessage, history: [] });
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error", "message"]);
  });

  it("allows a long-but-permitted message through", async () => {
    const res = await post({ sessionId: "s1", message: "word ".repeat(300), history: [] });
    expect(res.status).toBe(200);
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing validation for a missing message", async () => {
    const res = await post({ sessionId: "s1", history: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "sessionId and message are required" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("keeps the existing validation for an empty message", async () => {
    const res = await post({ sessionId: "s1", message: "   ", history: [] });
    expect(res.status).toBe(400);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("keeps the existing validation for malformed JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/chat", { method: "POST", body: "{not json" }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Invalid JSON" });
    expect(runAgent).not.toHaveBeenCalled();
  });
});
