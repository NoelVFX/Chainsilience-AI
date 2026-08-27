// Ambient declaration for the WebMCP surface the agent injects at runtime.
// Provided by ChatGPT's in-app browser (out of the box) or Google Chrome with
// chrome://flags/#enable-webmcp-testing enabled.
// Spec: https://github.com/webmachinelearning/webmcp

export interface WebMCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown> | unknown;
}

export interface ModelContext {
  // Some implementations return an unregister handle; treat it as optional.
  registerTool: (tool: WebMCPToolDefinition) => (() => void) | void;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

export {};
