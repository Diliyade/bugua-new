import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import fs from "fs/promises";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for DeepSeek and fallback Gemini divination
  app.post("/api/divinate", async (req, res) => {
    try {
      const { method, query, timeContext, userApiKey, model, role, hexagramInfo, qimenInfo, customPrompts } = req.body;

      // Select system instructions and prompts based on the chosen divination method
      // Allow customPrompts from the client-side for character card customization
      const activePrompts = customPrompts || {
        default: {
          personality: "客观、专业、条理清晰、科学严谨",
          style: "通俗易懂、不偏不倚，根据传统梅花易数与奇门遁甲学术推演规律，分条缕析地给出解析。"
        },
        sister: {
          personality: "极其温柔体贴、感同身受、亲切温暖。像一位充满智慧、包容万物的邻家姐姐。",
          style: "温和通俗，倾听烦恼，不要使用生硬呆板的专业术语，着重强调“塞翁失马，焉知非福”的哲学关怀，给出极具实操性、正能量的心灵指引。"
        },
        master: {
          personality: "言语风雅、深邃玄妙、一针见血、字字珠玑。仙风道骨的威严与豁达。",
          style: "字字千金，起笔直切要害。引用周易卦辞或奇门经典原文，言简意赅、极具穿透力，不拖泥带水，不谄媚，直接给出吉凶指示。"
        }
      };

      const selectedRole = role || "default";
      const targetPrompt = activePrompts[selectedRole] || activePrompts["default"];

      let systemInstruction = "";
      let prompt = "";

      if (method === "meihua") {
        systemInstruction = `
你是一位精通中国传统易学数术【梅花易数】的殿堂级宗师。
现在，请根据用户的起卦时空与心中所求，为您进行深度且具象的梅花易数解卦。

【重要：本次解卦采用的术数是：梅花易数】
【绝对禁止混淆：不要提及任何奇门遁甲概念（如九宫、八神、九星、八门、值符值使、三奇六仪等）。仅采用易经体用五行生克、八卦卦象、本卦、互卦、变卦、卦辞、动爻进行预测解卦。】

当前解卦大师设定：
- 角色性格：${targetPrompt.personality}
- 说话语气与解卦逻辑：${targetPrompt.style}

起卦推演核心参考数据：
---
梅花易数起卦分析数据：
本卦: ${hexagramInfo?.baseName || '待定'}（上卦: ${hexagramInfo?.baseUpper?.name || ''}${hexagramInfo?.baseUpper?.element || ''}，下卦: ${hexagramInfo?.baseLower?.name || ''}${hexagramInfo?.baseLower?.element || ''}）
互卦: ${hexagramInfo?.mutualName || '待定'}（上卦: ${hexagramInfo?.mutualUpper?.name || ''}${hexagramInfo?.mutualUpper?.element || ''}，下卦: ${hexagramInfo?.mutualLower?.name || ''}${hexagramInfo?.mutualLower?.element || ''}）
变卦: ${hexagramInfo?.changeName || '待定'}（上卦: ${hexagramInfo?.changeUpper?.name || ''}${hexagramInfo?.changeUpper?.element || ''}，下卦: ${hexagramInfo?.changeLower?.name || ''}${hexagramInfo?.changeLower?.element || ''}）
动爻: 第 ${hexagramInfo?.changeLine || '0'} 爻动
---

请严格遵照上述【解卦大师设定】进行解卦，回答必须使用 Markdown 格式。包含：
1. 本卦、互卦、变卦的卦象五行体用总论。
2. 针对求问事宜进行深刻细节解读（体用关系如何显示当前处境、发展变数及未来最终结果）。
3. 给出实用的、富有人生智慧的卦象化解建议与改运吉凶指引。
`;

        prompt = `
【本次测算方法：梅花易数 (绝非奇门遁甲)】
测算术数: 梅花易数
时令时空: ${timeContext}
求问事宜: ${query}

请为我进行深度起卦推演与解卦分析。
`;

      } else {
        // Qimen Dunjia
        systemInstruction = `
你是一位精通中国传统易学数术【奇门遁甲】的殿堂级宗师。
现在，请根据用户的起卦时空与心中所求，为您进行深度且具象的奇门遁甲解盘。

【重要：本次解卦采用的术数是：奇门遁甲】
【绝对禁止混淆：不要提及任何梅花易数概念（如本卦、互卦、变卦、体卦用卦、动爻等）。仅采用奇门遁甲九宫生克、天盘地盘、神星门仪组合生克、值符值使进行预测解盘。】

当前解卦大师设定：
- 角色性格：${targetPrompt.personality}
- 说话语气与解盘逻辑：${targetPrompt.style}

起卦推演核心参考数据：
---
奇门遁甲排盘分析数据：
时令参数: ${qimenInfo?.dunInfo || '待定'}
九宫格各宫落位参数: ${JSON.stringify(qimenInfo?.palaces || [])}
---

请严格遵照上述【解卦大师设定】进行解卦，回答必须使用 Markdown 格式。包含：
1. 奇门盘面时令总评、值符值使落宫吉凶。
2. 盘面核心用神细节解读（神星门仪组合生克关系，分析事情的当前阻碍、推进趋势 and 未来结论）。
3. 针对求问疑惑提供明确的行为指引、有利时空方位与开运趋避建议。
`;

        prompt = `
【本次测算方法：奇门遁甲 (绝非梅花易数)】
测算术数: 奇门遁甲
时令时空: ${timeContext}
求问事宜: ${query}

请为我进行深度起卦推演与解盘分析。
`;
      }

      let resultText = "";

      // Check if user set DeepSeek API Key, otherwise fallback to server key
      if (userApiKey) {
        try {
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
            // For DeepSeek models supporting thinking
            ...(model === "deepseek-v4-pro" ? {
              thinking: { type: "enabled" },
              reasoning_effort: "high",
            } : {})
          } as any);

          resultText = completion.choices[0].message.content || "";
        } catch (apiErr: any) {
          console.error("DeepSeek API call failed on server:", apiErr);
          throw new Error(`DeepSeek 接口调用失败: ${apiErr.message}`);
        }
      } else {
        // Fallback to Server Gemini API Key
        const serverGeminiKey = process.env.GEMINI_API_KEY;
        if (!serverGeminiKey) {
          return res.status(401).json({ error: "服务器未配置默认 API 密钥，请在系统设置中填入您的 DeepSeek API 密钥。" });
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

      res.json({ result: resultText });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "起卦解盘过程中发生未知错误。" });
    }
  });

  // API Route for testing API connectivity
  app.post("/api/test-connection", async (req, res) => {
    try {
      const { apiKey, model } = req.body;
      if (apiKey) {
        // Test DeepSeek API key
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
        return res.json({ success: true, message: "DeepSeek API 密钥验证通过，连接顺畅！", reply });
      } else {
        // Test Gemini (Server side)
        const serverGeminiKey = process.env.GEMINI_API_KEY;
        if (!serverGeminiKey) {
          return res.status(401).json({ success: false, error: "未配置全局默认 API 密钥，且未填写自定义密钥。" });
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
        return res.json({ success: true, message: "默认 Gemini 官方通道连接测试成功！", reply });
      }
    } catch (err: any) {
      console.error("Test connection failed:", err);
      res.status(500).json({ success: false, error: err.message || "连接测试失败，请检查 API Key 格式或网络状况。" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
