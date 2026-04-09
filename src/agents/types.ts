/**
 * Agent definition type — each agent plugin exports one of these.
 */

import type { AgentProfile, SharedSkillSource, SharedMcpSource, SharedAgentSource } from '../types.js';

export interface AgentDefinition {
  /** Agent identifier (must be unique, becomes part of AgentName union) */
  readonly name: string;
  /** Sync profile for this agent */
  readonly profile: AgentProfile;
  /** If this agent contributes skills to the shared pool */
  readonly sharedSkills?: Pick<SharedSkillSource, 'dir'>;
  /** If this agent contributes MCP config to the shared pool */
  readonly sharedMcp?: Pick<SharedMcpSource, 'src' | 'field'>;
  /** If this agent contributes custom agent definitions to the shared pool */
  readonly sharedAgents?: Pick<SharedAgentSource, 'dir'>;
}
