import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProfileFolder } from '../../mcp/src/profile-folder';
import { createAnswerOnceServer } from '../../mcp/src/server';
import { createNodeTextExtractor } from '../../src/infrastructure/text-extraction/node';

/** The text payload of a tool result. */
export function resultText(result: unknown): string {
  const content = (result as CallToolResult).content;
  return content.map((c) => (c.type === 'text' ? c.text : '')).join('');
}

export function resultJson<T = Record<string, unknown>>(result: unknown): T {
  return JSON.parse(resultText(result)) as T;
}

/** An in-process answeronce-mcp server on `folderPath`, connected to an SDK client. */
export async function connectInProcess(folderPath: string, clientName = 'claude-code') {
  const folder = new ProfileFolder(folderPath);
  const server = createAnswerOnceServer({ folder: async () => folder, extractor: createNodeTextExtractor(), version: 'test' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: clientName, version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server, folder, close: () => client.close() };
}
