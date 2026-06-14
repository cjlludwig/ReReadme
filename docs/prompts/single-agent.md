# Single Agent Task List

Re-implement the core rereadme agent flow with a single powerful agent with all tools available. The agent should leverage the TEMPLATE.md file as a to-do list and iterate over it by sub-heading to accomplish each individual set of instructions at a time before progressing. If the agent needs additional info for each section it should use do so

- Implement as net-new agent. You can reuse any logic that is helpful, especially tool calls.
- Replace the readme flow in-place, no new flags. map to this implementation.
- Re-use the diagraming agent for that section specifically to get the benefits of it's style rules.

## TODO Tools

To accomplish the to-do mechanism I'm thinking of adding new tools for scoped access to current state and updating that state as it progresses.

- `getReadmeTodo`
  - Shows the overall README task list derived from the template.
  - Lets the agent see what sections exist, what is done, and what remains.

- `getNextTodoSection`
  - Returns the next unfinished section in template order.
  - This is the main iteration mechanism so the agent cannot randomly skip around.

- `getCurrentTodoSection`
  - Re-reads the active section if the agent needs to check its instructions again.
  - Useful when the agent has done research and needs to return to the section task.

- `saveReadmeSection`
  - Saves the completed draft for the active section.
  - Also records whether the section is complete, omitted, or blocked.

- `validateReadmeWorkspace`
  - Checks the accumulated README draft before final output.
  - Catches missing required sections, leaked template instructions, heading drift, duplicated sections, and invalid omissions.

Core caveats:

- The template should stay immutable. The state is a workspace derived from the template, not edits to the template itself. Can just be a copy of template at start of run.
- Section order should be enforced by `getNextTodoSection`, not trusted to prompt-following alone.
- Only one section should be active at a time.
- Saving a section should be atomic: content plus status in one action.
- Required sections cannot be omitted.
- Optional sections can be omitted only with a reason.
- Blocked sections need a clear note about what information is missing.
- Final README assembly should be deterministic from saved sections, not reconstructed from the agent’s memory.
- Include a synthetic preamble/title section so title, badges, and top-of-file template guidance are tracked too.

## Validation

- Make sure the logic compiles with all static checks locally.
- Make sure tests run.
- Run `test_express_server` eval to ensure it basically runs and outputs a result. If there are critical issues fix but some validations can fail if fit and finish
