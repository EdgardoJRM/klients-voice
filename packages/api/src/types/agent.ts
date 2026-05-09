export type AgentStatus = "active" | "inactive";

export type AgentRecord = {
  agent_config_id: string;
  tenant_id: string;
  agent_name: string;
  elevenlabs_agent_id: string;
  default_phone_number_id?: string;
  language?: string;
  voice_style?: string;
  prompt_template?: string;
  first_message_template?: string;
  event_type_supported?: string[];
  status: AgentStatus;
  created_at: string;
  updated_at: string;
};
