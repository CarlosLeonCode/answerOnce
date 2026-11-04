import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { DocumentTextExtractor } from '../../src/ports/document-text-extractor';
import { describeSource, openFolder, resolveFolder, type FolderInputs } from './folder';
import { createAnswerOnceServer } from './server';

export interface ServeOptions {
  folder: FolderInputs;
  extractor: () => DocumentTextExtractor;
  version: string;
}

/** Runs the MCP server on stdin/stdout. Diagnostics go to stderr only. */
export async function serve(options: ServeOptions): Promise<void> {
  // stdout carries the MCP protocol: route any stray console output from dependencies to stderr.
  console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);
  let extractor: DocumentTextExtractor | null = null;
  const server = createAnswerOnceServer({
    version: options.version,
    extractor: {
      canExtract: (file) => (extractor ??= options.extractor()).canExtract(file),
      extractText: (file) => (extractor ??= options.extractor()).extractText(file),
    },
    // Resolved on every call, so fixing the setup needs no restart.
    folder: () => openFolder(options.folder),
  });
  await server.connect(new StdioServerTransport());
  const resolved = await resolveFolder(options.folder).catch(() => null);
  const where = resolved ? `folder: ${resolved.folder}, from ${describeSource(resolved.source)}` : 'profile folder not set';
  console.error(`answeronce-mcp ${options.version} running on stdio (${where})`);
}
