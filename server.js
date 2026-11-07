#!/usr/bin/env node
// server.js — Node wrapper: serves Xray VLESS+WS+TLS on Pxxl Free.
// Reads UUID/WSPATH from environment; never hard-code secrets here.
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const os = require("os");
const { spawn } = require("child_process");

const PORT = parseInt(process.env.PORT || "8080", 10);
const XRAY_PORT = 10001;
const BIN = path.join(__dirname, "bin", "xray");
const CFG = path.join(os.tmpdir(), "config.json");

const uuid = process.env.UUID || process.env.APP_KEY;
const wspath = process.env.WSPATH || "/ws";
if (!uuid) {
  console.error("[server] missing UUID env var — set UUID in the Pxxl dashboard");
  process.exit(1);
}

const config = {
  log: { loglevel: "warning" },
  inbounds: [{
    port: XRAY_PORT,
    listen: "127.0.0.1",
    protocol: "vless",
    settings: { clients: [{ id: uuid, level: 0 }], decryption: "none" },
    streamSettings: {
      network: "ws",
      wsSettings: { path: wspath },
      security: "none"
    }
  }],
  outbounds: [{ protocol: "freedom", tag: "direct" }]
};
fs.writeFileSync(CFG, JSON.stringify(config, null, 2));
console.log(`[server] config written (uuid=${uuid.slice(0, 8)}..., path=${wspath})`);

// Static HTTP responses for health-checks / browser visits.
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK\n");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found\n");
});
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === wspath) {
    const upstream = net.connect(XRAY_PORT, "127.0.0.1", () => {
      const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
      if (head && head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  } else {
    socket.destroy();
  }
});

const xray = spawn(BIN, ["-c", CFG], { stdio: ["pipe", "inherit", "inherit"] });
xray.on("error", (err) => {
  console.error("[server] failed to start xray:", err.message);
  process.exit(1);
});
xray.on("exit", (code, signal) => {
  console.error(`[server] xray exited code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${PORT}`);
  console.log(`[server] xray core starting on internal port ${XRAY_PORT} (ws path ${wspath})`);
});
