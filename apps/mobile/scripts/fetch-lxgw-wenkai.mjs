import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FONT_COMMIT = '4d2df149f67075611c9f14f73380b518c4dde80b';
const FONT_BASE =
  'https://raw.githubusercontent.com/lxgw/LxgwWenKai/4d2df149f67075611c9f14f73380b518c4dde80b';
const CONTENTS_BASE =
  'https://api.github.com/repos/lxgw/LxgwWenKai/contents';
const RAW_FETCH_TIMEOUT_MS = 10_000;
const CONTENTS_FETCH_TIMEOUT_MS = 120_000;
const FALLBACK_CHUNK_BYTES = 5 * 1024 * 1024;

export const FONT_FILES = Object.freeze({
  'LXGWWenKai-Regular.ttf': `${FONT_BASE}/fonts/TTF/LXGWWenKai-Regular.ttf`,
  'LXGWWenKai-Medium.ttf': `${FONT_BASE}/fonts/TTF/LXGWWenKai-Medium.ttf`,
  'OFL.txt': `${FONT_BASE}/OFL.txt`
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '../assets/fonts');

class HttpResponseError extends Error {}

function formatError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function readResponse(filename, response) {
  if (!response.ok) {
    throw new HttpResponseError(
      `Failed to fetch ${filename}: HTTP ${response.status}`
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`Failed to fetch ${filename}: received an empty response`);
  }

  return bytes;
}

function contentsUrl(rawUrl) {
  const prefix = `${FONT_BASE}/`;
  if (!rawUrl.startsWith(prefix)) {
    throw new Error(`Font URL is outside the pinned upstream: ${rawUrl}`);
  }

  const relativePath = rawUrl.slice(prefix.length);
  return `${CONTENTS_BASE}/${relativePath}?ref=${FONT_COMMIT}`;
}

async function fetchContentsFallback(filename, url) {
  const fallbackUrl = contentsUrl(url);
  const headers = { Accept: 'application/vnd.github.raw+json' };
  const headResponse = await fetch(fallbackUrl, {
    headers,
    method: 'HEAD',
    signal: AbortSignal.timeout(CONTENTS_FETCH_TIMEOUT_MS)
  });

  if (!headResponse.ok) {
    throw new HttpResponseError(
      `Failed to fetch ${filename} metadata: HTTP ${headResponse.status}`
    );
  }

  const contentLength = Number(headResponse.headers.get('content-length'));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new Error(`Failed to fetch ${filename}: invalid content length`);
  }

  const ranges = [];
  for (let start = 0; start < contentLength; start += FALLBACK_CHUNK_BYTES) {
    ranges.push({
      start,
      end: Math.min(start + FALLBACK_CHUNK_BYTES - 1, contentLength - 1)
    });
  }

  const chunks = await Promise.all(
    ranges.map(async ({ start, end }) => {
      const response = await fetch(fallbackUrl, {
        headers: { ...headers, Range: `bytes=${start}-${end}` },
        signal: AbortSignal.timeout(CONTENTS_FETCH_TIMEOUT_MS)
      });

      if (response.status !== 206) {
        throw new HttpResponseError(
          `Failed to fetch ${filename} bytes ${start}-${end}: HTTP ${response.status}`
        );
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== end - start + 1) {
        throw new Error(
          `Failed to fetch ${filename} bytes ${start}-${end}: incomplete response`
        );
      }

      return { start, bytes };
    })
  );

  const bytes = new Uint8Array(contentLength);
  for (const chunk of chunks) {
    bytes.set(chunk.bytes, chunk.start);
  }

  return bytes;
}

async function downloadFile(filename, url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(RAW_FETCH_TIMEOUT_MS)
    });
    return {
      filename,
      bytes: await readResponse(filename, response)
    };
  } catch (rawError) {
    // A real upstream HTTP error must remain fatal. The pinned Contents API is
    // only a transport fallback for environments where the raw host is blocked.
    if (rawError instanceof HttpResponseError) {
      throw rawError;
    }

    try {
      return {
        filename,
        bytes: await fetchContentsFallback(filename, url)
      };
    } catch (contentsError) {
      throw new Error(
        `Failed to fetch ${filename}; raw attempt: ${formatError(rawError)}; ` +
          `pinned Contents API attempt: ${formatError(contentsError)}`
      );
    }
  }
}

export async function fetchPinnedFonts() {
  const downloads = await Promise.all(
    Object.entries(FONT_FILES).map(([filename, url]) =>
      downloadFile(filename, url)
    )
  );

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    downloads.map(({ filename, bytes }) =>
      writeFile(path.join(outputDirectory, filename), bytes)
    )
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  await fetchPinnedFonts();
}
