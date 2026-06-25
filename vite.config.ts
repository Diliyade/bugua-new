import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

function apiMiddlewarePlugin() {
  return {
    name: 'api-middleware',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url === '/api/divinate' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { method, query, timeContext, userApiKey, model, role, hexagramInfo, qimenInfo } = JSON.parse(body);
              
              // Select system instructions based on the chosen role card
              let rolePrompt = "";
              if (role === "sister") {
                rolePrompt = `
角色定位：【知心大姐姐】
说话语气：极其温柔体贴、感同身受、亲切温暖。不要使用生硬呆板的专业术语，而是要像一位充满智慧、包容万物的邻家姐姐一样，一边为你沏一碗温热的茶，一边倾听你的烦恼。
解卦逻辑：首先对用户所烦恼或询问的事情给予真诚的安慰与理解，拉近距离；接着，用非常温和通俗的语言将卦象（梅花卦辞、体用克应，或奇门格局）中的天机拆解开来。着重强调“塞翁失马，焉知非福”的哲学关怀，帮助用户宽心，并给出极具实操性、正能量的心灵指引。
`;
              } else if (role === "master") {
                rolePrompt = `
角色定位：【国学大师】
说话语气：言语风雅、深邃玄妙、一针见血、字字珠玑。带着一种道法自然、仙风道骨的威严与豁达。
解卦逻辑：起笔即直切要害。引用《周易》卦辞、九宫生克等经典原文，言简意赅、极具穿透力地剖析当前的吉凶趋势。不拖泥带水，不谄媚，直接给出天道指示，帮助用户洞若观火，明辨是非。
`;
              } else {
                rolePrompt = `
角色定位：【默认角色 (金牌命理师)】
说话语气：客观、专业、条理清晰、通俗易懂、科学严谨。
解卦逻辑：不偏不倚地根据传统《梅花易数》与《奇门遁甲》的推演规律，给出详细的起卦排盘解析。分条缕析地列出：现状剖析、过程变数、未来结果、对应外应与化解建议。
`;
              }

              const systemInstruction = `
你是一位精通中国传统易学数术【梅花易数】与【奇门遁甲】的殿堂级宗师。
现在，请根据用户的起卦时间与心中所求，为您进行深度且具象的起卦解盘。

${rolePrompt}

起卦推演核心参考数据：
---
梅花易数起卦分析数据：
本卦: ${hexagramInfo?.baseName || '待定'}（上卦: ${hexagramInfo?.baseUpper?.name || ''}${hexagramInfo?.baseUpper?.element || ''}，下卦: ${hexagramInfo?.baseLower?.name || ''}${hexagramInfo?.baseLower?.element || ''}）
互卦: ${hexagramInfo?.mutualName || '待定'}（上卦: ${hexagramInfo?.mutualUpper?.name || ''}${hexagramInfo?.mutualUpper?.element || ''}，下卦: ${hexagramInfo?.mutualLower?.name || ''}${hexagramInfo?.mutualLower?.element || ''}）
变卦: ${hexagramInfo?.changeName || '待定'}（上卦: ${hexagramInfo?.changeUpper?.name || ''}${hexagramInfo?.changeUpper?.element || ''}，下卦: ${hexagramInfo?.changeLower?.name || ''}${hexagramInfo?.changeLower?.element || ''}）
动爻: 第 ${hexagramInfo?.changeLine || '0'} 爻动

奇门遁甲排盘分析数据：
时令参数: ${qimenInfo?.dunInfo || '待定'}
九宫格各宫落位参数: ${JSON.stringify(qimenInfo?.palaces || [])}
---

请严格遵照您的【角色定位】进行解卦，回答必须使用 Markdown 格式。包含：
1. 时令与起卦格局综述。
2. 卦象/盘面核心细节解读。
3. 针对求问事宜的具体建议、吉凶指引与改运方向。
`;

              const prompt = `
测算术数: ${method === 'meihua' ? '梅花易数' : '奇门遁甲'}
时令时空: ${timeContext}
求问事宜: ${query}

请为我进行深度起卦推演与解卦分析。
`;

              let resultText = "";

              if (userApiKey) {
                const openai = new OpenAI({
                  baseURL: "https://api.deepseek.com",
                  apiKey: userApiKey,
                });

                const completion = await openai.chat.completions.create({
                  model: model || "deepseek-v4-flash",
                  messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: prompt }
                  ],
                  ...(model === "deepseek-v4-pro" ? {
                    thinking: { type: "enabled" },
                    reasoning_effort: "high",
                  } : {})
                } as any);

                resultText = completion.choices[0].message.content || "";
              } else {
                const serverGeminiKey = process.env.GEMINI_API_KEY;
                if (!serverGeminiKey) {
                  res.statusCode = 401;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'No API Key configured on server or in settings.' }));
                  return;
                }

                const ai = new GoogleGenAI({ apiKey: serverGeminiKey });
                const response = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: prompt,
                  config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7,
                  },
                });
                resultText = response.text || "";
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ result: resultText }));
            } catch (error: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: error.message || 'An error occurred during divination.' }));
            }
          });
        } else if (req.url === '/api/test-connection' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { apiKey, model } = JSON.parse(body);
              if (apiKey) {
                const openai = new OpenAI({
                  baseURL: "https://api.deepseek.com",
                  apiKey: apiKey,
                });
                const completion = await openai.chat.completions.create({
                  model: model || "deepseek-v4-flash",
                  messages: [
                    { role: "user", content: "hi" }
                  ],
                  max_tokens: 10,
                  ...(model === "deepseek-v4-pro" ? {
                    thinking: { type: "enabled" },
                    reasoning_effort: "high",
                  } : {})
                } as any);
                const reply = completion.choices[0]?.message?.content || "";
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: "DeepSeek API 密钥验证通过，连接顺畅！", reply }));
              } else {
                const serverGeminiKey = process.env.GEMINI_API_KEY;
                if (!serverGeminiKey) {
                  res.statusCode = 401;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: "未配置全局默认 API 密钥，且未填写自定义密钥。" }));
                  return;
                }
                const ai = new GoogleGenAI({ apiKey: serverGeminiKey });
                const response = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: "hi",
                  config: {
                    maxOutputTokens: 10
                  }
                });
                const reply = response.text || "";
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: "默认 Gemini 官方通道连接测试成功！", reply }));
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message || "连接测试失败，请检查 API Key 格式或网络状况。" }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiMiddlewarePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
