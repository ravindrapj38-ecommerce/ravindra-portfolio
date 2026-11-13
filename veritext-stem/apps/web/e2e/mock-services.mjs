// Stand-ins for the two external services, for end-to-end tests only:
//   POST /v1/licenses/validate  (Lemon Squeezy License API)
//   POST /v1/messages           (Anthropic Messages API)
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
export const GOOD_KEY = "E2E00000-AAAA-BBBB-CCCC-RESEARCHER01";

const read = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const edit = (s) => s.replace("It is worth noting that the", "The").replace("in order to", "to").replace("We delve into", "We report");

createServer(async (req, res) => {
  const body = await read(req);
  const path = (req.url ?? "").split("?")[0];
  if (req.method === "POST" && path === "/v1/licenses/validate") {
    const key = new URLSearchParams(body).get("license_key");
    if (key === GOOD_KEY)
      return send(res, 200, {
        valid: true,
        error: null,
        license_key: { id: 777, status: "active", test_mode: false },
        meta: { store_id: 4242, variant_id: 111, customer_email: "ada@example.edu" },
      });
    return send(res, 404, { valid: false, error: "license_key not found." });
  }
  if (req.method === "POST" && path === "/v1/messages") {
    const payload = JSON.parse(body);
    const user = payload.messages.at(-1).content;
    const text = typeof user === "string" ? user : user.map((b) => b.text ?? "").join("");
    const list = JSON.parse(text.slice(text.lastIndexOf("\n[") + 1));
    const sentences = list.map((item) => edit(typeof item === "string" ? item : item.original));
    return send(res, 200, {
      id: "msg_e2e",
      type: "message",
      role: "assistant",
      model: payload.model,
      content: [{ type: "text", text: JSON.stringify({ sentences }) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
  }
  if (path === "/health") return send(res, 200, { ok: true });
  send(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock services on ${PORT}`));
