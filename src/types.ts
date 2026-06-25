export type DivinationMethod = 'meihua' | 'qimen';

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
