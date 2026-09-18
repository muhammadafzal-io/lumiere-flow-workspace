import { describe, expect, it } from "vitest";
import { createVoiceMetrics, summarizeVoiceMetrics } from "../session-metrics";

describe("createVoiceMetrics", () => {
  it("starts empty", () => {
    expect(createVoiceMetrics().snapshot()).toMatchObject({
      responses: 0,
      responsesCancelled: 0,
      transcriptsAccepted: 0,
      transcriptsRejected: 0,
      totalTokens: 0,
    });
  });

  it("adds up the usage of every response", () => {
    const m = createVoiceMetrics();
    m.responseUsage({
      total_tokens: 1200,
      input_tokens: 1000,
      output_tokens: 200,
      input_token_details: { audio_tokens: 300, cached_tokens: 600 },
      output_token_details: { audio_tokens: 150 },
    });
    m.responseUsage({
      total_tokens: 800,
      input_tokens: 700,
      output_tokens: 100,
      input_token_details: { audio_tokens: 200, cached_tokens: 400 },
      output_token_details: { audio_tokens: 90 },
    });
    expect(m.snapshot()).toMatchObject({
      responses: 2,
      inputTokens: 1700,
      outputTokens: 300,
      cachedInputTokens: 1000,
      inputAudioTokens: 500,
      outputAudioTokens: 240,
      totalTokens: 2000,
    });
  });

  it("still counts a response whose usage the provider omitted", () => {
    const m = createVoiceMetrics();
    m.responseUsage(undefined);
    expect(m.snapshot()).toMatchObject({ responses: 1, totalTokens: 0 });
  });

  it("counts rejections by reason", () => {
    const m = createVoiceMetrics();
    m.transcriptRejected("junk");
    m.transcriptRejected("junk");
    m.transcriptRejected("echo");
    m.transcriptAccepted();
    const snap = m.snapshot();
    expect(snap.transcriptsRejected).toBe(3);
    expect(snap.transcriptsAccepted).toBe(1);
    expect(snap.rejectionsByReason).toMatchObject({ junk: 2, echo: 1, empty: 0 });
  });

  it("counts tool calls by name", () => {
    const m = createVoiceMetrics();
    m.toolCalled("check_availability");
    m.toolCalled("check_availability");
    m.toolCalled("book_appointment");
    expect(m.snapshot()).toMatchObject({
      toolCalls: 3,
      toolCallsByName: { check_availability: 2, book_appointment: 1 },
    });
  });

  it("returns a copy, so a later event cannot mutate an old snapshot", () => {
    const m = createVoiceMetrics();
    m.transcriptRejected("junk");
    const snap = m.snapshot();
    m.transcriptRejected("junk");
    expect(snap.rejectionsByReason.junk).toBe(1);
  });
});

describe("summarizeVoiceMetrics", () => {
  it("flattens counts for logging, with no transcript text", () => {
    const m = createVoiceMetrics();
    m.responseUsage({ total_tokens: 500, input_tokens: 400, output_tokens: 100 });
    m.speechDetected();
    m.transcriptAccepted();
    m.transcriptRejected("junk");
    m.responseCancelled();
    m.toolCalled("check_availability");
    const summary = summarizeVoiceMetrics(m.snapshot(), 92.4);
    expect(summary).toMatchObject({
      call_seconds: 92,
      responses: 1,
      responses_cancelled: 1,
      speech_events: 1,
      transcripts_accepted: 1,
      transcripts_rejected: 1,
      rejected_breakdown: "junk:1",
      tool_calls: 1,
      tools: "check_availability:1",
      total_tokens: 500,
    });
    expect(
      Object.values(summary).every((v) => typeof v === "number" || typeof v === "string"),
    ).toBe(true);
  });

  it("reads clearly when nothing was rejected", () => {
    const summary = summarizeVoiceMetrics(createVoiceMetrics().snapshot(), 0);
    expect(summary.rejected_breakdown).toBe("none");
    expect(summary.tools).toBe("none");
  });
});
