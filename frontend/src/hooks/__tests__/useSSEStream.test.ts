import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSSEStream } from "../useSSEStream";

// Helper to create a ReadableStream from SSE lines
function createSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = lines.map((l) => encoder.encode(l + "\n"));
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

function mockFetch(lines: string[], status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    body: createSSEStream(lines),
    text: () => Promise.resolve("Error"),
  } as unknown as Response);
}

describe("useSSEStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses text chunk events", async () => {
    const lines = [
      'data: {"type":"text","content":"Hello"}',
      'data: {"type":"text","content":" world"}',
      "data: [DONE]",
    ];
    global.fetch = mockFetch(lines);

    const accumulated: string[] = [];
    const { result } = renderHook(() => useSSEStream());

    await act(async () => {
      result.current.startStream("token", "/api/test", {}, {
        onText: (text) => accumulated.push(text),
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
        onConfirmation: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      });
      // Allow microtasks to flush
      await new Promise((r) => setTimeout(r, 50));
    });

    // Text should accumulate: first "Hello", then "Hello world"
    expect(accumulated.length).toBe(2);
    expect(accumulated[0]).toBe("Hello");
    expect(accumulated[1]).toBe("Hello world");
  });

  it("parses tool_call events", async () => {
    const lines = [
      'data: {"type":"tool_call","name":"search_contacts","status":"running"}',
      "data: [DONE]",
    ];
    global.fetch = mockFetch(lines);

    const toolCalls: string[] = [];
    const { result } = renderHook(() => useSSEStream());

    await act(async () => {
      result.current.startStream("token", "/api/test", {}, {
        onText: vi.fn(),
        onToolCall: (name) => toolCalls.push(name),
        onToolResult: vi.fn(),
        onConfirmation: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(toolCalls).toEqual(["search_contacts"]);
  });

  it("handles [DONE] signal", async () => {
    const lines = [
      'data: {"type":"text","content":"Hi"}',
      "data: [DONE]",
    ];
    global.fetch = mockFetch(lines);

    const onDone = vi.fn();
    const { result } = renderHook(() => useSSEStream());

    await act(async () => {
      result.current.startStream("token", "/api/test", {}, {
        onText: vi.fn(),
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
        onConfirmation: vi.fn(),
        onDone,
        onError: vi.fn(),
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it("handles connection error", async () => {
    global.fetch = mockFetch([], 500);

    const onError = vi.fn();
    const { result } = renderHook(() => useSSEStream());

    await act(async () => {
      result.current.startStream("token", "/api/test", {}, {
        onText: vi.fn(),
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
        onConfirmation: vi.fn(),
        onDone: vi.fn(),
        onError,
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onError).toHaveBeenCalledOnce();
  });

  it("parses confirmation events", async () => {
    const lines = [
      'data: {"type":"confirmation","tool":"create_contact","preview":{"first_name":"John"},"pending_id":"p1"}',
      "data: [DONE]",
    ];
    global.fetch = mockFetch(lines);

    const confirmations: Array<{ tool: string; pendingId: string }> = [];
    const { result } = renderHook(() => useSSEStream());

    await act(async () => {
      result.current.startStream("token", "/api/test", {}, {
        onText: vi.fn(),
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
        onConfirmation: (tool, _preview, pendingId) =>
          confirmations.push({ tool, pendingId }),
        onDone: vi.fn(),
        onError: vi.fn(),
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(confirmations).toEqual([{ tool: "create_contact", pendingId: "p1" }]);
  });
});
