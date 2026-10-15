export const engineUrl = () => (process.env.ENGINE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
