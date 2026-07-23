import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

export interface FixtureServerOptions {
  readonly host?: string;
  readonly rootDir?: string;
}

export interface FixtureServer {
  readonly origin: string;
  close(): Promise<void>;
  urlFor(pathname: string): string;
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(
  response: ServerResponse,
  statusCode: number,
  body: string | Buffer,
  contentType = "text/plain; charset=utf-8",
  headOnly = false,
): void {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(headOnly ? undefined : body);
}

function safeFilePath(rootDir: string, requestPathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPathname);
  } catch {
    return undefined;
  }
  if (decoded.includes("\0")) {
    return undefined;
  }
  const withIndex = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const candidate = resolve(rootDir, `.${withIndex.replaceAll("\\", "/")}`);
  const relativePath = relative(rootDir, candidate);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath.includes(`..${sep}`) ||
    relativePath.length === 0
  ) {
    return undefined;
  }
  return candidate;
}

async function listen(server: Server, host: string): Promise<number> {
  await new Promise<void>((resolveListen, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, host);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fixture server did not bind to an IP port.");
  }
  return address.port;
}

export async function startFixtureServer(
  options: FixtureServerOptions = {},
): Promise<FixtureServer> {
  const host = options.host ?? "127.0.0.1";
  const rootDir = resolve(options.rootDir ?? resolve(process.cwd(), "fixtures"));

  const server = createServer((request, response) => {
    void (async () => {
      const method = request.method?.toUpperCase() ?? "GET";
      if (method !== "GET" && method !== "HEAD") {
        send(response, 405, "Method Not Allowed");
        return;
      }

      const requestUrl = new URL(request.url ?? "/", `http://${host}`);
      const filePath = safeFilePath(rootDir, requestUrl.pathname);
      if (filePath === undefined) {
        send(response, 400, "Invalid fixture path");
        return;
      }

      try {
        const metadata = await stat(filePath);
        if (!metadata.isFile()) {
          send(response, 404, "Fixture not found");
          return;
        }
        const body = await readFile(filePath);
        const contentType =
          MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
        send(response, 200, body, contentType, method === "HEAD");
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        send(
          response,
          code === "ENOENT" ? 404 : 500,
          code === "ENOENT" ? "Fixture not found" : "Fixture read failed",
        );
      }
    })();
  });

  const port = await listen(server, host);
  const origin = `http://${host}:${String(port)}`;
  let closed = false;
  return {
    origin,
    async close(): Promise<void> {
      if (closed) {
        return;
      }
      closed = true;
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolveClose();
          } else {
            reject(error);
          }
        });
      });
    },
    urlFor(pathname: string): string {
      return new URL(pathname, `${origin}/`).toString();
    },
  };
}
