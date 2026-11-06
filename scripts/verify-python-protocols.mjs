import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = resolve(process.argv[2] ?? "../OpenPyCharm-demo");
const bin = join(root, ".venv", process.platform === "win32" ? "Scripts" : "bin");
const python = join(bin, process.platform === "win32" ? "python.exe" : "python");
const timeoutMs = 60_000;

function connect(command, args, dialect) {
  const child = spawn(command, args, { cwd: root, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let sequence = 0;
  let buffer = Buffer.alloc(0);
  let stderr = "";
  const pending = new Map();
  const events = [];
  const watchers = new Set();
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  const fail = (error) => {
    for (const entry of pending.values()) entry.reject(error);
    for (const entry of watchers) entry.reject(error);
    pending.clear();
    watchers.clear();
  };
  child.on("error", fail);
  child.on("exit", (code) => fail(new Error(`Protocol process exited (${code}): ${stderr}`)));
  const deliver = (message) => {
    const key = dialect === "dap" ? message.request_seq : message.id;
    const entry = pending.get(key);
    if (entry) {
      pending.delete(key);
      if (message.error || message.success === false) entry.reject(new Error(JSON.stringify(message)));
      else entry.resolve(dialect === "dap" ? message.body : message.result);
    }
    if (message.event) {
      events.push(message);
      for (const watcher of [...watchers])
        if (watcher.event === message.event) {
          watchers.delete(watcher);
          watcher.resolve(message.body);
        }
    }
  };
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const length = Number(/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, separator).toString())?.[1]);
      if (!Number.isFinite(length)) return fail(new Error("Invalid protocol frame"));
      const end = separator + 4 + length;
      if (buffer.length < end) return;
      const message = JSON.parse(buffer.subarray(separator + 4, end).toString());
      buffer = buffer.subarray(end);
      deliver(message);
    }
  });
  const send = (message) => {
    const payload = Buffer.from(JSON.stringify(message));
    child.stdin.write(`Content-Length: ${payload.length}\r\n\r\n`);
    child.stdin.write(payload);
  };
  const deadline = (register, remove) =>
    new Promise((resolveResult, rejectResult) => {
      const timer = setTimeout(() => {
        remove();
        rejectResult(new Error(`Protocol timeout: ${stderr}`));
      }, timeoutMs);
      register({
        resolve: (value) => {
          clearTimeout(timer);
          resolveResult(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectResult(error);
        },
      });
    });
  return {
    request(method, params) {
      const id = ++sequence;
      const response = deadline(
        (entry) => pending.set(id, entry),
        () => pending.delete(id),
      );
      send(
        dialect === "dap"
          ? { seq: id, type: "request", command: method, arguments: params }
          : { jsonrpc: "2.0", id, method, params },
      );
      return response;
    },
    notify(method, params) {
      send({ jsonrpc: "2.0", method, params });
    },
    event(event) {
      const existing = events.find((message) => message.event === event);
      if (existing) return Promise.resolve(existing.body);
      let watcher;
      return deadline(
        (entry) => {
          watcher = { ...entry, event };
          watchers.add(watcher);
        },
        () => watchers.delete(watcher),
      );
    },
    close() {
      child.kill();
    },
  };
}

const language = connect(
  join(bin, process.platform === "win32" ? "basedpyright-langserver.exe" : "basedpyright-langserver"),
  ["--stdio"],
  "lsp",
);
const results = {};
let debug;
let launched;
let launchError;
let failure;
try {
  await language.request("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    capabilities: {},
    initializationOptions: {},
  });
  language.notify("initialized", {});
  language.notify("workspace/didChangeConfiguration", { settings: { python: { pythonPath: python } } });
  const uri = pathToFileURL(join(root, "protocol_probe.py")).href;
  language.notify("textDocument/didOpen", {
    textDocument: { uri, languageId: "python", version: 1, text: "import pathlib\npathlib.\n" },
  });
  const completion = await language.request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 1, character: 8 },
  });
  const items = Array.isArray(completion) ? completion : (completion?.items ?? []);
  assert(
    items.some((item) => item.label === "Path"),
    "pathlib.Path completion was not returned",
  );
  results.completion = "pathlib.Path";
  await language.request("shutdown", null);
  language.notify("exit", null);

  debug = connect(python, ["-m", "debugpy.adapter"], "dap");
  await debug.request("initialize", {
    clientID: "openpycharm-verification",
    adapterID: "python",
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: "path",
  });
  launched = debug
    .request("launch", {
      name: "OpenPyCharm verification",
      type: "python",
      request: "launch",
      program: join(root, "main.py"),
      cwd: root,
      python,
      console: "internalConsole",
      justMyCode: true,
    })
    .catch((error) => {
      launchError = error;
    });
  await debug.event("initialized");
  const breakpoints = await debug.request("setBreakpoints", {
    source: { path: join(root, "main.py") },
    breakpoints: [{ line: 2 }],
  });
  assert(breakpoints.breakpoints[0].verified, "Breakpoint was not verified");
  await debug.request("configurationDone", {});
  await launched;
  if (launchError) throw launchError;
  const stopped = await debug.event("stopped");
  const stack = await debug.request("stackTrace", { threadId: stopped.threadId });
  assert.equal(stack.stackFrames[0].line, 2);
  const scopes = await debug.request("scopes", { frameId: stack.stackFrames[0].id });
  const variables = await debug.request("variables", { variablesReference: scopes.scopes[0].variablesReference });
  assert(variables.variables.some((variable) => variable.name === "name" && variable.value.includes("OpenPyCharm")));
  const evaluated = await debug.request("evaluate", {
    expression: "name.upper()",
    frameId: stack.stackFrames[0].id,
    context: "watch",
  });
  assert(evaluated.result.includes("OPENPYCHARM"));
  await debug.request("continue", { threadId: stopped.threadId });
  await debug.event("terminated");
  results.debugger = { breakpointLine: 2, variable: "name", evaluated: evaluated.result, terminated: true };
} catch (error) {
  failure = error;
} finally {
  language.close();
  debug?.close();
  if (launched) await launched;
}
if (failure) throw failure;
process.stdout.write(JSON.stringify(results, null, 2) + "\n");
