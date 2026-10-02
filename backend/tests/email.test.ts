import { createServer, Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpEmailTransport } from "../src/services/email";

let server: Server;
let endpoint: string;
let received: { headers: Record<string, string | string[] | undefined>; body: any } | undefined;

beforeAll(async () => {
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    received = { headers: request.headers, body: JSON.parse(raw) };
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "provider-message-1" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Email test server failed to start.");
  endpoint = `http://127.0.0.1:${address.port}/send`;
});

afterAll(async () => {
  if (typeof (server as any).closeAllConnections === "function") (server as any).closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("X2 HTTP email transport", () => {
  it("uses backend authorization and provider idempotency without exposing credentials in its result", async () => {
    const transport = new HttpEmailTransport({ apiUrl: endpoint, apiKey: "test-provider-secret-key", timeoutMs: 2000 });
    const result = await transport.send({
      to: "recipient@example.test",
      from: "no-reply@example.test",
      subject: "Activation",
      text: "one-time activation message",
      html: "<p>one-time activation message</p>",
      idempotencyKey: "activation-delivery:1:1",
    });
    expect(result).toEqual({ provider: "http", messageId: "provider-message-1" });
    expect(received?.headers.authorization).toBe("Bearer test-provider-secret-key");
    expect(received?.headers["idempotency-key"]).toBe("activation-delivery:1:1");
    expect(received?.body.to).toBe("recipient@example.test");
    expect(JSON.stringify(result)).not.toContain("test-provider-secret-key");
  });
});
