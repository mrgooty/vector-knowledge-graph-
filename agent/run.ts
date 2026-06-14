// Public streaming entrypoint for the agent. Delegates to the multi-agent
// orchestrator (cache-first → gather → index → retrieve → synthesize → assemble).
export { orchestrate as runAgentStream, type AgentEvent } from "./orchestrator";
