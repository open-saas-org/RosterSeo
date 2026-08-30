import type { CappyTurnEmit, CappyTurnEvent } from "./agent-loop";

export type CappyStreamEvent = CappyTurnEvent | { type: "error"; error: string };

// NDJSON over a plain fetch body - one JSON object per line, flushed as
// each real message/status is produced - instead of one blocking
// request/response that only resolves once the whole (possibly
// multi-tool-call) turn is done. No SSE framing needed since this is
// consumed with a ReadableStream reader on the client, not EventSource.
export function streamCappyTurn(run: (emit: CappyTurnEmit) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: CappyTurnEmit = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await run(emit);
      } catch (err) {
        const event: CappyStreamEvent = { type: "error", error: err instanceof Error ? err.message : "Cappy couldn't respond. Try again." };
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
}
