export type DivinationMethod = 'meihua' | 'qimen';

export interface FollowUpMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface DivinationRequest {
  method: DivinationMethod;
  query: string;
  timeContext: string;
  userApiKey?: string;
}

export interface DivinationResponse {
  result?: string;
  error?: string;
}

