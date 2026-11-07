#!/usr/bin/env node
// setup.js — build-time download of the xray-core binary.
// Runs during `npm run build` / platform build phase.
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

const VERSION = "v25.12.1";
const URL = `https://github.com/XTLS/Xray-core/releases/download/${VERSION}/Xray-linux-64.zip`;
const ZIP = path.join(__dirname, "xray.zip");
const BIN_DIR = path.join(__dirname, "bin");
const BIN = path.join(BIN_DIR, "xray");

function log(...a) { console.log("[setup]", ...a); }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    log("downloading", url);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        log("redirect ->", res.headers.location);
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error("download failed: HTTP " + res.statusCode));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
  });
}

async function main() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  if (fs.existsSync(BIN)) { log("xray already present, skipping"); return; }
  await download(URL, ZIP);
  log("unzipping");
  execSync(`unzip -o "${ZIP}" -d "${BIN_DIR}"`, { stdio: "inherit" });
  fs.chmodSync(BIN, 0o755);
  fs.unlinkSync(ZIP);
  log("xray ready:", BIN);
}

main().catch((err) => { console.error(err); process.exit(1); });
