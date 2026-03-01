import type { RunContext } from '@openai/agents';

export async function invokeTool(
  tool: { invoke: (ctx: RunContext<unknown>, params: string) => Promise<string> },
  params: Record<string, unknown>
): Promise<string> {
  return tool.invoke(null as unknown as RunContext<unknown>, JSON.stringify(params));
}
