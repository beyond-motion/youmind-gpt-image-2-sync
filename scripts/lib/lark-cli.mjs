import { execFile, execFileSync } from "child_process";

const PROXY_ENV_KEYS = [
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY"
];

const TRANSIENT_NETWORK_MARKERS = [
  "no such host",
  "temporary failure in name resolution",
  "server misbehaving",
  "tls handshake timeout",
  "i/o timeout",
  "connection reset by peer",
  "connection refused",
  "unexpected eof",
  "broken pipe",
  "network is unreachable",
  "timeout awaiting response headers"
];

const RETRY_DELAYS_MS = [1000, 2000, 5000];

function formatCommandError(error) {
  const stdout = error.stdout ? String(error.stdout) : "";
  const stderr = error.stderr ? String(error.stderr) : "";
  const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
  return detail || error.message;
}

function buildLarkEnv() {
  const env = { ...process.env, LARK_CLI_NO_PROXY: "1", NO_PROXY: "*", no_proxy: "*" };
  for (const key of PROXY_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

function shouldRetryLarkError(error) {
  const detail = formatCommandError(error).toLowerCase();
  return TRANSIENT_NETWORK_MARKERS.some((marker) => detail.includes(marker));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function runLarkCli(args) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return execFileSync("lark-cli", args, {
        encoding: "utf8",
        env: buildLarkEnv(),
        maxBuffer: 1024 * 1024 * 64
      }).trim();
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !shouldRetryLarkError(error)) {
        throw new Error(`lark-cli ${args.join(" ")} failed:\n${formatCommandError(error)}`);
      }
      sleepSync(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw new Error(`lark-cli ${args.join(" ")} failed with unknown retry state`);
}

export function runLarkCliJson(args) {
  const output = runLarkCli(args);
  return JSON.parse(output);
}

export function runLarkCliAsync(args) {
  return new Promise((resolve, reject) => {
    const runOnce = (attempt) => {
      execFile(
        "lark-cli",
        args,
        {
          encoding: "utf8",
          env: buildLarkEnv(),
          maxBuffer: 1024 * 1024 * 64
        },
        (error, stdout, stderr) => {
          if (error) {
            const detailError = { ...error, stdout, stderr };
            if (attempt < RETRY_DELAYS_MS.length && shouldRetryLarkError(detailError)) {
              setTimeout(() => runOnce(attempt + 1), RETRY_DELAYS_MS[attempt]);
              return;
            }
            reject(new Error(`lark-cli ${args.join(" ")} failed:\n${formatCommandError(detailError)}`));
            return;
          }

          resolve(String(stdout || "").trim());
        }
      );
    };

    runOnce(0);
  });
}

export async function runLarkCliJsonAsync(args) {
  const output = await runLarkCliAsync(args);
  return JSON.parse(output);
}
