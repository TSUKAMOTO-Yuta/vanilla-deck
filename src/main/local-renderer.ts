import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, net, protocol } from 'electron';

const SCHEME = 'vanilla-deck';
const RENDERER_FILES = [
  'toolbar/index.html',
  'toolbar/style.css',
  'toolbar/toolbar.mjs',
  'scrollbar/index.html',
  'scrollbar/style.css',
  'scrollbar/scrollbar.mjs',
] as const;

type RendererFile = (typeof RENDERER_FILES)[number];

function isRendererFile(value: string): value is RendererFile {
  return (RENDERER_FILES as readonly string[]).includes(value);
}

function resolveRendererPath(file: RendererFile): string {
  return file.endsWith('.mjs') ? `dist/renderer/${file}` : `src/renderer/${file}`;
}

export function registerLocalRendererScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
      },
    },
  ]);
}

export function registerLocalRendererProtocol(): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const file = `${url.hostname}${url.pathname}`;
    if (!isRendererFile(file)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(
      pathToFileURL(path.resolve(app.getAppPath(), resolveRendererPath(file))).toString(),
    );
  });
}
