export async function invokeTool(
  tool: { invoke: (ctx: null, params: string) => Promise<string> },
  params: Record<string, unknown>
): Promise<string> {
  return tool.invoke(null, JSON.stringify(params));
}
