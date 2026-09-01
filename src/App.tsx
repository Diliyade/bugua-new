import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Settings, 
  Compass, 
  MoonStar, 
  Loader2, 
  Sparkles, 
  History as HistoryIcon,
  Trash2,
  Calendar,
  X,
  User,
  Heart,
  Award,
  ChevronRight,
  Info,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Wifi,
  MessageSquare,
  Send,
  Copy,
  Check,
  RotateCcw
} from "lucide-react";
import Markdown from "react-markdown";
import { Lunar, Solar } from "lunar-javascript";
import OpenAI from "openai";
import { cn } from "./lib/utils";
import OctahedronDie from "./components/OctahedronDie";
import BaguaWheel from "./components/BaguaWheel";
import { 
  calculateMeihua, 
  calculateMeihuaByDice, 
  calculateQimen, 
  getMeihuaDetailedPromptContext, 
  getQimenDetailedPromptContext,
  TRIGRAMS, 
  getCustomJieQi,
  getPreciseJieQi,
  type MeihuaResult, 
  type QimenPalace, 
  type TrigramInfo 
} from "./utils/divination";
import { ICHING_DATA } from "./utils/ichingData";
import type { DivinationMethod, DivinationResponse, FollowUpMessage } from "./types";

export const getDeepSeekActualModel = (m: string) => {
  if (m === "deepseek-v4-pro" || m === "deepseek-reasoner") {
    return "deepseek-reasoner";
  }
  return "deepseek-chat";
};

interface RolePromptCustom {
  personality: string;
  style: string;
}

interface CustomPrompts {
  default: RolePromptCustom;
  sister: RolePromptCustom;
  master: RolePromptCustom;
}

const DEFAULT_CUSTOM_PROMPTS: CustomPrompts = {
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
    style: "字字千金，起笔直切要害。引用卦辞或经典原文，言简意赅、极具穿透力，不拖泥带水，不谄媚，直接给出吉凶指示。"
  }
};

interface DivinationHistoryItem {
  id: string;
  method: DivinationMethod;
  query: string;
  timeContext: string;
  result: string;
  timestamp: number;
  hexagramInfo?: MeihuaResult;
  qimenInfo?: ReturnType<typeof calculateQimen>;
  role?: string;
  followUps?: FollowUpMessage[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"cast" | "history" | "settings">("cast");
  const [castMethod, setCastMethod] = useState<"meihua" | "qimen">("meihua");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<"deepseek-v4-flash" | "deepseek-v4-pro">("deepseek-v4-flash");
  const [role, setRole] = useState<"default" | "sister" | "master">("default");
  const [customPrompts, setCustomPrompts] = useState<CustomPrompts>(() => {
    const stored = localStorage.getItem("custom_role_prompts");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return DEFAULT_CUSTOM_PROMPTS;
      }
    }
    return DEFAULT_CUSTOM_PROMPTS;
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  
  // Meihua Dice Roll state
  const [isRollingDice, setIsRollingDice] = useState(false);
  const [rollStep, setRollStep] = useState<"idle" | "rolling_upper" | "rolling_lower" | "rolling_moving" | "done">("idle");
  const [rolledUpper, setRolledUpper] = useState<number | null>(null);
  const [rolledLower, setRolledLower] = useState<number | null>(null);
  const [rolledMoving, setRolledMoving] = useState<number | null>(null);

  // History logs
  const [historyList, setHistoryList] = useState<DivinationHistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<DivinationHistoryItem | null>(null);

  useEffect(() => {
    const storedKey = localStorage.getItem("user_api_key") || "";
    const storedModel = (localStorage.getItem("user_model") || "deepseek-v4-flash") as any;
    const storedRole = (localStorage.getItem("user_role") || "default") as any;
    
    setApiKey(storedKey);
    setModel(storedModel);
    setRole(storedRole);

    const storedHistory = localStorage.getItem("divination_history");
    if (storedHistory) {
      try {
        setHistoryList(JSON.parse(storedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const handleSaveSettings = (key: string, chosenModel: typeof model, chosenRole: typeof role, updatedPrompts: CustomPrompts) => {
    setApiKey(key);
    setModel(chosenModel);
    setRole(chosenRole);
    setCustomPrompts(updatedPrompts);
    localStorage.setItem("user_api_key", key);
    localStorage.setItem("user_model", chosenModel);
    localStorage.setItem("user_role", chosenRole);
    localStorage.setItem("custom_role_prompts", JSON.stringify(updatedPrompts));
  };

  const clearHistory = () => {
    setHistoryList([]);
    localStorage.removeItem("divination_history");
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = historyList.filter(item => item.id !== id);
    setHistoryList(updated);
    localStorage.setItem("divination_history", JSON.stringify(updated));
    if (selectedHistory?.id === id) {
      setSelectedHistory(null);
    }
  };



  // Perform rolling/casting sequence for Meihua dice
  const handleMeihuaRollSequence = async () => {
    if (isRollingDice || rollStep !== "idle") return;

    // Reset rolls and set state to active rolling
    setRolledUpper(null);
    setRolledLower(null);
    setRolledMoving(null);
    setRollStep("rolling_upper");
    setIsRollingDice(true);

    // Roll 1: Upper Trigram (8-sided die)
    await new Promise(resolve => setTimeout(resolve, 1100));
    const upperVal = Math.floor(Math.random() * 8) + 1;
    setRolledUpper(upperVal);
    setIsRollingDice(false);
    setRollStep("rolling_lower");

    // Pause briefly
    await new Promise(resolve => setTimeout(resolve, 400));
    setIsRollingDice(true);

    // Roll 2: Lower Trigram (8-sided die)
    await new Promise(resolve => setTimeout(resolve, 1100));
    const lowerVal = Math.floor(Math.random() * 8) + 1;
    setRolledLower(lowerVal);
    setIsRollingDice(false);
    setRollStep("rolling_moving");

    // Pause briefly
    await new Promise(resolve => setTimeout(resolve, 400));
    setIsRollingDice(true);

    // Roll 3: Moving Line (6-sided die)
    await new Promise(resolve => setTimeout(resolve, 1100));
    const movingVal = Math.floor(Math.random() * 6) + 1;
    setRolledMoving(movingVal);
    setIsRollingDice(false);
    setRollStep("done");

    // Short pause to appreciate the final roll, then automatically save and redirect
    await new Promise(resolve => setTimeout(resolve, 800));
    saveMeihuaHistoryAndRedirect(upperVal, lowerVal, movingVal);
  };

  const saveMeihuaHistoryAndRedirect = (upper: number, lower: number, moving: number) => {
    const date = new Date();
    const solar = Solar.fromDate(date);
    const lunar = Lunar.fromDate(date);
    
    const timeContext = `公历: ${solar.getYear()}年${solar.getMonth()}月${solar.getDay()}日 ${date.getHours()}时${date.getMinutes()}分
农历: ${lunar.getYearInGanZhi()}年 ${lunar.getMonthInGanZhi()}月 ${lunar.getDayInGanZhi()}日 ${lunar.getTimeInGanZhi()}时
节气: ${getCustomJieQi(solar.getYear(), solar.getMonth(), solar.getDay())}`;

    const mResult = calculateMeihuaByDice(upper, lower, moving);
    
    const newItem: DivinationHistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      method: "meihua",
      query: query.trim() ? query.trim() : "泛问运势",
      timeContext: timeContext,
      result: "等待解卦中...",
      timestamp: Date.now(),
      hexagramInfo: mResult
    };

    const updated = [newItem, ...historyList];
    setHistoryList(updated);
    localStorage.setItem("divination_history", JSON.stringify(updated));

    // Reset local casting states
    setQuery("");
    setRolledUpper(null);
    setRolledLower(null);
    setRolledMoving(null);
    setRollStep("idle");

    // Redirect
    setActiveTab("history");
    setSelectedHistory(newItem);
  };

  // Perform casting sequence for Qimen Dunjia
  const handleQimenCastSequence = async () => {
    if (isRollingDice) return;
    setIsRollingDice(true);
    
    // Simulate high-speed stellar rotation for ritual immersion (spinning the Bagua wheel)
    await new Promise(resolve => setTimeout(resolve, 1400));
    
    const date = new Date();
    const solar = Solar.fromDate(date);
    const lunar = Lunar.fromDate(date);
    
    const timeContext = `公历: ${solar.getYear()}年${solar.getMonth()}月${solar.getDay()}日 ${date.getHours()}时${date.getMinutes()}分
农历: ${lunar.getYearInGanZhi()}年 ${lunar.getMonthInGanZhi()}月 ${lunar.getDayInGanZhi()}日 ${lunar.getTimeInGanZhi()}时
节气: ${getPreciseJieQi(date)}`;

    const qResult = calculateQimen(date);
    const newItem: DivinationHistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      method: "qimen",
      query: query.trim() ? query.trim() : "泛问运势",
      timeContext: timeContext,
      result: "等待解卦中...",
      timestamp: Date.now(),
      qimenInfo: qResult
    };

    const updated = [newItem, ...historyList];
    setHistoryList(updated);
    localStorage.setItem("divination_history", JSON.stringify(updated));

    // Reset local casting states
    setQuery("");
    setIsRollingDice(false);

    // Redirect
    setActiveTab("history");
    setSelectedHistory(newItem);
  };

  // Interpret a historical or newly cast divination
  const interpretDivination = async (targetItem: DivinationHistoryItem, chosenRole?: string) => {
    if (loading) return;
    setLoading(true);
    const selectedR = chosenRole || role;

    // Show initial in-progress state immediately for instant feedback
    const inProgressItem: DivinationHistoryItem = {
      ...targetItem,
      result: "",
      role: selectedR
    };
    setSelectedHistory(inProgressItem);
    setHistoryList(prev => prev.map(h => h.id === targetItem.id ? inProgressItem : h));

    try {
      const targetPrompt = customPrompts[selectedR as keyof typeof customPrompts] || customPrompts.default;
      const rolePrompt = `
当前解卦大师设定：
- 角色性格：${targetPrompt.personality}
- 说话语气与解盘逻辑：${targetPrompt.style}
`;

      let systemInstruction = "";
      let prompt = "";

      if (targetItem.method === "meihua") {
        const hex = targetItem.hexagramInfo;
        const analysis = hex ? getMeihuaDetailedPromptContext(hex) : null;

        systemInstruction = `
你是一位精通中国传统易学数术【梅花易数】的殿堂级宗师。
【重要学术原则：严谨依卦推演，严禁虚构妄断】
【绝对禁止混淆：不要提及任何奇门遁甲概念（如九宫、八神、九星、八门、值符值使、三奇六仪等）。仅采用易经体用五行生克、八卦卦象、本卦、互卦、变卦、卦辞、动爻进行预测解卦。】

【梅花易数客观推导核心铁律数据】：
1. 本卦：【${hex?.baseName || '待定'}】
   - 体卦（代表求测者自身/主体）：${analysis?.tiPosition || '待定'}【${analysis?.tiTrigram?.name || ''}（五行属${analysis?.tiTrigram?.element || ''}）】
   - 用卦（代表所测之事/外部客体）：${analysis?.yongPosition || '待定'}【${analysis?.yongTrigram?.name || ''}（五行属${analysis?.yongTrigram?.element || ''}）】
   - 本卦体用生克定性：${analysis?.baseRelation || '待定'}
   - 本卦周易卦辞：《周易》卦辞曰：“${analysis?.baseJudgment || ''}”
2. 动爻（第 ${hex?.changeLine || '0'} 爻动）：
   - 权威动爻爻辞：“${analysis?.movingYaoText || ''}”
   - 动爻指引：请将此爻辞作为洞察事态演变与行动契机的核心切入点。
3. 互卦（代表事情推进的中途过程与暗流）：【${hex?.mutualName || '待定'}】（上卦${hex?.mutualUpper?.name || ''}${hex?.mutualUpper?.element || ''}，下卦${hex?.mutualLower?.name || ''}${hex?.mutualLower?.element || ''}）
4. 变卦（代表事情发展的最终结局与归宿）：【${hex?.changeName || '待定'}】
   - 变卦体卦仍为：【${analysis?.tiTrigram?.name || ''}（五行属${analysis?.tiTrigram?.element || ''}）】
   - 变卦用卦变为：【${analysis?.changeYongTrigram?.name || ''}（五行属${analysis?.changeYongTrigram?.element || ''}）】
   - 变卦终局生克定性：${analysis?.changeRelation || '待定'}
   - 变卦周易卦辞：《周易》卦辞曰：“${analysis?.changeJudgment || ''}”

${rolePrompt}

请严格遵照上述【解卦大师设定】进行解卦，回答必须使用 Markdown 格式，条理清晰，包含：
1. **【卦象总断与体用生克】**：明确指出体卦（${analysis?.tiTrigram?.name || ''}${analysis?.tiTrigram?.element || ''}）与用卦（${analysis?.yongTrigram?.name || ''}${analysis?.yongTrigram?.element || ''}）的生克关系（${analysis?.baseRelation || ''}），定下吉凶大纲。
2. **【动爻爻辞精解】**：紧扣动爻爻辞“${analysis?.movingYaoText || ''}”，点破求测者当前所处阶段与破局关键。
3. **【事态演进与变卦终局】**：结合互卦【${hex?.mutualName || ''}】的过程推演与变卦【${hex?.changeName || ''}】（${analysis?.changeRelation || ''}），剖析事情推进中的阻碍、助力与最终定局。
4. **【趋吉避凶与开运指引】**：结合体卦五行（${analysis?.tiTrigram?.element || ''}）与卦象哲理，给出务实、有智慧的人生建议与开运策略。
`;

        prompt = `
【本次测算方法：梅花易数 (绝非奇门遁甲)】
测算术数: 梅花易数
时令时空: ${targetItem.timeContext}
求问事宜: ${targetItem.query}

请基于上述推导铁律，为我进行深度起卦推演与解卦分析。
`;

      } else {
        // Qimen Dunjia
        const qimen = targetItem.qimenInfo;
        const qAnalysis = qimen ? getQimenDetailedPromptContext(qimen) : null;

        systemInstruction = `
你是一位精通中国传统易学数术【奇门遁甲】的殿堂级宗师。
【重要学术原则：严谨依盘推演，严禁虚构妄断】
【绝对禁止混淆：不要提及任何梅花易数概念（如本卦、互卦、变卦、体卦用卦、动爻等）。仅采用奇门遁甲九宫生克、天盘地盘、神星门仪组合生克、值符值使进行预测解盘。】

【奇门遁甲客观排盘核心参考数据】：
- 时令与格局: ${qimen?.dunInfo || '待定'}
- 四柱干支: 年柱[${qimen?.bazi?.year || ''}] 月柱[${qimen?.bazi?.month || ''}] 日柱[${qimen?.bazi?.day || ''}] 时柱[${qimen?.bazi?.hour || ''}]
- 日干（代表求测者自身）: [${qAnalysis?.dayStem || ''}]，落宫: [${qAnalysis?.dayPalace?.name || ''}${qAnalysis?.dayPalace?.direction || ''}（五行属${qAnalysis?.dayPalace?.element || ''}），临${qAnalysis?.dayPalace?.gate || ''}、${qAnalysis?.dayPalace?.star || ''}、${qAnalysis?.dayPalace?.god || ''}]
- 时干（代表所求测之事体）: [${qAnalysis?.hourStem || ''}]，落宫: [${qAnalysis?.hourPalace?.name || ''}${qAnalysis?.hourPalace?.direction || ''}（五行属${qAnalysis?.hourPalace?.element || ''}），临${qAnalysis?.hourPalace?.gate || ''}、${qAnalysis?.hourPalace?.star || ''}、${qAnalysis?.hourPalace?.god || ''}]
- 值符（大将所居首领）: ${qimen?.zhifuStar || ''}落[${qAnalysis?.zhifuPalace?.name || ''}]；值使（执行使者）: ${qimen?.zhishiGate || ''}落[${qAnalysis?.zhishiPalace?.name || ''}]
- 三吉门落位: 开门在[${qAnalysis?.kaiPalace?.name || ''}]，休门在[${qAnalysis?.xiuPalace?.name || ''}]，生门在[${qAnalysis?.shengPalace?.name || ''}]
- 九宫全盘明细: ${JSON.stringify(qimen?.palaces || [])}

${rolePrompt}

请严格遵照上述【解卦大师设定】进行解卦，回答必须使用 Markdown 格式，包含：
1. **【奇门大局与时令总评】**：分析时令局数与值符值使落宫格局吉凶。
2. **【用神落宫与生克透视】**：对比日干（求测者）与时干（事体）落宫的五行生克及神星门仪组合，剖析当前处境与阻力所在。
3. **【吉凶断语与未来走势】**：依据三吉门与格局变化，指明事情后续发展演变趋势与最终结果。
4. **【开运方位与时空趋避指南】**：提供明确的有利方位、避凶策略与行动时机建议。
`;

        prompt = `
【本次测算方法：奇门遁甲 (绝非梅花易数)】
测算术数: 奇门遁甲
时令时空: ${targetItem.timeContext}
求问事宜: ${targetItem.query}

请为我进行深度起卦推演与解盘分析。
`;
      }

      if (!apiKey) {
        setActiveTab("settings");
        throw new Error("您尚未配置您的 DeepSeek API Key。为了保障您的正常使用，已自动跳转至设置页面。请配置您的自定义 API 密钥。如尚未拥有 API Key，可点击设置中的链接前往 DeepSeek 官方开放平台获取。");
      }

      const openai = new OpenAI({
        baseURL: "https://api.deepseek.com",
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });

      const actualModel = getDeepSeekActualModel(model);
      const isReasoner = actualModel === "deepseek-reasoner";

      const stream: any = await openai.chat.completions.create({
        model: actualModel,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        stream: true,
        temperature: 0.6,
        ...(isReasoner ? {
          thinking: { type: "enabled" },
          reasoning_effort: "high",
        } : {})
      } as any);

      let accumulated = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        accumulated += delta;

        const liveItem: DivinationHistoryItem = {
          ...targetItem,
          result: accumulated,
          role: selectedR
        };
        setSelectedHistory(liveItem);
        setHistoryList(prev => prev.map(h => h.id === targetItem.id ? liveItem : h));
      }

      const finalItem: DivinationHistoryItem = {
        ...targetItem,
        result: accumulated || "未能获取解卦结果。",
        role: selectedR
      };
      setSelectedHistory(finalItem);
      const updatedHistory = historyList.map(h => h.id === targetItem.id ? finalItem : h);
      setHistoryList(updatedHistory);
      localStorage.setItem("divination_history", JSON.stringify(updatedHistory));

    } catch (err: any) {
      alert(`解卦推算失败: ${err.message || "未知错误"}`);
      setSelectedHistory(targetItem);
      setHistoryList(prev => prev.map(h => h.id === targetItem.id ? targetItem : h));
    } finally {
      setLoading(false);
    }
  };

  // Handle in-depth follow-up questioning based on current divination
  const handleFollowUp = async (targetItem: DivinationHistoryItem, question: string) => {
    if (!question.trim() || followUpLoading || loading) return;
    
    if (!apiKey) {
      setActiveTab("settings");
      alert("您尚未配置 DeepSeek API Key，已自动跳转至设置页面。请配置您的自定义 API 密钥后再进行追问。");
      return;
    }

    const selectedR = targetItem.role || role;
    const targetPrompt = customPrompts[selectedR as keyof typeof customPrompts] || customPrompts.default;
    const rolePrompt = `
当前解卦大师设定：
- 角色性格：${targetPrompt.personality}
- 说话语气与解盘逻辑：${targetPrompt.style}
`;

    let systemInstruction = "";
    if (targetItem.method === "meihua") {
      const hex = targetItem.hexagramInfo;
      const analysis = hex ? getMeihuaDetailedPromptContext(hex) : null;
      systemInstruction = `
你是一位精通中国传统易学数术【梅花易数】的殿堂级宗师。
【重要学术原则：严谨依卦推演，严禁虚构妄断】
【绝对禁止混淆：不要提及任何奇门遁甲概念。仅采用易经体用五行生克、八卦卦象、本卦、互卦、变卦、卦辞、动爻进行预测解卦。】

【梅花易数客观推导核心铁律数据】：
1. 本卦：【${hex?.baseName || '待定'}】
   - 体卦（代表求测者自身/主体）：${analysis?.tiPosition || '待定'}【${analysis?.tiTrigram?.name || ''}（五行属${analysis?.tiTrigram?.element || ''}）】
   - 用卦（代表所测之事/外部客体）：${analysis?.yongPosition || '待定'}【${analysis?.yongTrigram?.name || ''}（五行属${analysis?.yongTrigram?.element || ''}）】
   - 本卦体用生克定性：${analysis?.baseRelation || '待定'}
   - 本卦周易卦辞：《周易》卦辞曰：“${analysis?.baseJudgment || ''}”
2. 动爻（第 ${hex?.changeLine || '0'} 爻动）：
   - 权威动爻爻辞：“${analysis?.movingYaoText || ''}”
3. 互卦（代表事情推进的中途过程与暗流）：【${hex?.mutualName || '待定'}】（上卦${hex?.mutualUpper?.name || ''}${hex?.mutualUpper?.element || ''}，下卦${hex?.mutualLower?.name || ''}${hex?.mutualLower?.element || ''}）
4. 变卦（代表事情发展的最终结局与归宿）：【${hex?.changeName || '待定'}】
   - 变卦终局生克定性：${analysis?.changeRelation || '待定'}
   - 变卦周易卦辞：《周易》卦辞曰：“${analysis?.changeJudgment || ''}”

${rolePrompt}

【当前核心任务：用户就该卦深入追问】
用户正在就当前的卦象向您进行针对性【深度追问】。
请以大师口吻，紧扣本卦、互卦、变卦的体用五行生克与动爻爻辞，切中要害地为求测者答疑解惑：
1. 切勿说空话套话，正面回应用户的追问焦点。
2. 结合卦象体用生克和动爻，指出最适合的行动契机、转折时机或避坑策略。
3. 给出具体的时空方位、心理调适或开运化解建议。
回答请使用清晰优雅的 Markdown 格式。
`;
    } else {
      const qimen = targetItem.qimenInfo;
      const qAnalysis = qimen ? getQimenDetailedPromptContext(qimen) : null;
      systemInstruction = `
你是一位精通中国传统易学数术【奇门遁甲】的殿堂级宗师。
【重要学术原则：严谨依盘推演，严禁虚构妄断】
【绝对禁止混淆：不要提及任何梅花易数概念。仅采用奇门遁甲九宫生克、天盘地盘、神星门仪组合生克、值符值使进行预测解盘。】

【奇门遁甲客观排盘核心参考数据】：
- 时令与格局: ${qimen?.dunInfo || '待定'}
- 四柱干支: 年柱[${qimen?.bazi?.year || ''}] 月柱[${qimen?.bazi?.month || ''}] 日柱[${qimen?.bazi?.day || ''}] 时柱[${qimen?.bazi?.hour || ''}]
- 日干（代表求测者自身）: [${qAnalysis?.dayStem || ''}]，落宫: [${qAnalysis?.dayPalace?.name || ''}${qAnalysis?.dayPalace?.direction || ''}（五行属${qAnalysis?.dayPalace?.element || ''}），临${qAnalysis?.dayPalace?.gate || ''}、${qAnalysis?.dayPalace?.star || ''}、${qAnalysis?.dayPalace?.god || ''}]
- 时干（代表所求测之事体）: [${qAnalysis?.hourStem || ''}]，落宫: [${qAnalysis?.hourPalace?.name || ''}${qAnalysis?.hourPalace?.direction || ''}（五行属${qAnalysis?.hourPalace?.element || ''}），临${qAnalysis?.hourPalace?.gate || ''}、${qAnalysis?.hourPalace?.star || ''}、${qAnalysis?.hourPalace?.god || ''}]
- 值符: ${qimen?.zhifuStar || ''}落[${qAnalysis?.zhifuPalace?.name || ''}]；值使: ${qimen?.zhishiGate || ''}落[${qAnalysis?.zhishiPalace?.name || ''}]
- 三吉门落位: 开门在[${qAnalysis?.kaiPalace?.name || ''}]，休门在[${qAnalysis?.xiuPalace?.name || ''}]，生门在[${qAnalysis?.shengPalace?.name || ''}]
- 九宫全盘明细: ${JSON.stringify(qimen?.palaces || [])}

${rolePrompt}

【当前核心任务：用户就该奇门局深入追问】
用户正在就当前的奇门遁甲盘面对您进行针对性【深度追问】。
请以大师口吻，紧扣日干时干落宫生克、值符值使、吉凶门星与神煞格局，切中要害地为求测者答疑解惑：
1. 切勿说空话套话，正面回应用户的追问焦点。
2. 结合奇门盘面吉凶神星门仪，指出最适合的行动契机、转折时机或避坑策略。
3. 给出具体的时空方位、心理调适或开运化解建议。
回答请使用清晰优雅的 Markdown 格式。
`;
    }

    const userMsgId = Math.random().toString(36).substr(2, 9);
    const assistantMsgId = Math.random().toString(36).substr(2, 9);

    const newUserMsg: FollowUpMessage = {
      id: userMsgId,
      role: 'user',
      content: question.trim(),
      timestamp: Date.now()
    };

    const newAssistantMsg: FollowUpMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };

    const existingFollowUps = targetItem.followUps || [];
    const updatedFollowUps = [...existingFollowUps, newUserMsg, newAssistantMsg];

    const inProgressItem: DivinationHistoryItem = {
      ...targetItem,
      followUps: updatedFollowUps
    };

    // Immediate UI & storage persistence
    setSelectedHistory(inProgressItem);
    setHistoryList(prev => prev.map(h => h.id === targetItem.id ? inProgressItem : h));
    const interimHistory = historyList.map(h => h.id === targetItem.id ? inProgressItem : h);
    localStorage.setItem("divination_history", JSON.stringify(interimHistory));
    setFollowUpLoading(true);

    try {
      const openai = new OpenAI({
        baseURL: "https://api.deepseek.com",
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });

      const actualModel = getDeepSeekActualModel(model);
      const isReasoner = actualModel === "deepseek-reasoner";

      // Build chat message history for multi-turn context
      const chatMessages: any[] = [
        { role: "system", content: systemInstruction },
        { 
          role: "user", 
          content: `【起卦求测事宜】: ${targetItem.query}\n【起卦时空时令】: ${targetItem.timeContext}\n请先为我做出第一阶段卦象盘局解析。` 
        },
        { 
          role: "assistant", 
          content: targetItem.result 
        }
      ];

      // Append prior follow-up conversation turns
      for (const msg of existingFollowUps) {
        chatMessages.push({
          role: msg.role,
          content: msg.content
        });
      }

      // Append current user follow-up
      chatMessages.push({
        role: "user",
        content: question.trim()
      });

      const stream: any = await openai.chat.completions.create({
        model: actualModel,
        messages: chatMessages,
        stream: true,
        temperature: 0.6,
        ...(isReasoner ? {
          thinking: { type: "enabled" },
          reasoning_effort: "high",
        } : {})
      } as any);

      let accumulated = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        accumulated += delta;

        const liveFollowUps = updatedFollowUps.map(m => 
          m.id === assistantMsgId ? { ...m, content: accumulated } : m
        );

        const liveItem: DivinationHistoryItem = {
          ...targetItem,
          followUps: liveFollowUps
        };

        setSelectedHistory(liveItem);
        setHistoryList(prev => prev.map(h => h.id === targetItem.id ? liveItem : h));
      }

      const finalFollowUps = updatedFollowUps.map(m => 
        m.id === assistantMsgId ? { ...m, content: accumulated || "大师已推演此问，天机自在心中。" } : m
      );

      const finalItem: DivinationHistoryItem = {
        ...targetItem,
        followUps: finalFollowUps
      };

      setSelectedHistory(finalItem);
      const updatedHistory = historyList.map(h => h.id === targetItem.id ? finalItem : h);
      setHistoryList(updatedHistory);
      localStorage.setItem("divination_history", JSON.stringify(updatedHistory));

    } catch (err: any) {
      alert(`追问推算失败: ${err.message || "未知错误"}`);
      const failedFollowUps = updatedFollowUps.map(m => 
        m.id === assistantMsgId ? { ...m, content: m.content || `（推算未能完成: ${err.message || "请求异常"}）` } : m
      );
      const failedItem: DivinationHistoryItem = {
        ...targetItem,
        followUps: failedFollowUps
      };
      setSelectedHistory(failedItem);
      const updatedHistory = historyList.map(h => h.id === targetItem.id ? failedItem : h);
      setHistoryList(updatedHistory);
      localStorage.setItem("divination_history", JSON.stringify(updatedHistory));
    } finally {
      setFollowUpLoading(false);
    }
  };

  // Clear follow-up conversation history for a specific divination
  const handleClearFollowUps = (targetItem: DivinationHistoryItem) => {
    const updatedItem: DivinationHistoryItem = {
      ...targetItem,
      followUps: []
    };
    setSelectedHistory(updatedItem);
    const updatedHistory = historyList.map(h => h.id === targetItem.id ? updatedItem : h);
    setHistoryList(updatedHistory);
    localStorage.setItem("divination_history", JSON.stringify(updatedHistory));
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#2C2C2E] font-sans selection:bg-[#E6C15C] selection:text-black pb-28">
      {/* Noble Chinese Ink & Gold Header */}
      <header className="pt-6 pb-4 px-6 bg-white/95 backdrop-blur-2xl sticky top-0 z-30 border-b border-gray-200/50 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-[#967520] to-[#E6C15C] p-2.5 rounded-2xl shadow-md shadow-yellow-500/10 flex justify-center items-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-[#1C1C1E]">卜卦</h1>
              <p className="text-[10px] text-[#967520] tracking-widest uppercase font-bold">Zen Ink Divine</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto px-4 pt-4">
        <AnimatePresence mode="wait">
          {activeTab === "settings" ? (
            <SettingsPanel 
              key="settings" 
              apiKey={apiKey} 
              model={model} 
              role={role} 
              customPrompts={customPrompts}
              onSave={handleSaveSettings} 
              onBack={() => setActiveTab("cast")} 
            />
          ) : activeTab === "cast" ? (
            <div className="space-y-6">
              {/* Premium Sub-Tab Selector for Divination Method */}
              <div className="bg-white/80 backdrop-blur-md p-1.5 rounded-2xl border border-gray-200/60 shadow-sm flex gap-1">
                <button
                  onClick={() => { setCastMethod("meihua"); }}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-semibold tracking-wider transition-all flex items-center justify-center gap-1.5",
                    castMethod === "meihua"
                      ? "bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white shadow-sm"
                      : "text-gray-500 hover:text-[#1C1C1E]"
                  )}
                >
                  <MoonStar className="w-3.5 h-3.5" />
                  <span>梅花易数</span>
                </button>
                <button
                  onClick={() => { setCastMethod("qimen"); }}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-semibold tracking-wider transition-all flex items-center justify-center gap-1.5",
                    castMethod === "qimen"
                      ? "bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white shadow-sm"
                      : "text-gray-500 hover:text-[#1C1C1E]"
                  )}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>奇门遁甲</span>
                </button>
              </div>

              {/* Method-Specific Casting Layout */}
              {castMethod === "meihua" ? (
                <div className="space-y-6">
                  {/* Visual 3D Octahedral Dice Area */}
                  <div className="bg-[#FFFFFF]/70 backdrop-blur-xl p-5 rounded-3xl border border-gray-200/50 shadow-sm flex flex-col items-center">
                    <span className="text-[10px] text-[#967520] tracking-widest uppercase font-bold mb-1">Meihua Yishu Dice Casting</span>
                    <h3 className="text-xs text-gray-400 mb-2">点击骰子或大按钮，求天地感应，摇出乾坤之卦</h3>
                    
                    <div onClick={handleMeihuaRollSequence} className="w-full">
                      <OctahedronDie 
                        isRolling={isRollingDice && (rollStep === "rolling_upper" || rollStep === "rolling_lower")} 
                        targetValue={rollStep === "rolling_lower" ? rolledUpper : rollStep === "rolling_moving" ? rolledLower : null} 
                      />
                    </div>
                  </div>

                  {/* Query text area */}
                  <div className="bg-[#FFFFFF]/70 backdrop-blur-xl p-6 rounded-3xl border border-gray-200/50 shadow-sm relative overflow-hidden">
                    <h2 className="text-xs font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#E6C15C] rounded-full" />
                      所求何事 (心中的疑惑)
                    </h2>
                    <p className="text-[10px] text-gray-400 mb-3">若留空，默认为您泛问自身今日运势。</p>
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="如：今日财运如何？出行是否顺利？（不填默认泛问运势）"
                      className="w-full bg-[#FAF9F5] border border-gray-200/60 rounded-2xl px-4 py-3 text-xs text-[#1C1C1E] min-h-[70px] resize-none focus:outline-none focus:border-[#E6C15C] transition-all placeholder:text-gray-400 leading-relaxed"
                    />

                    {/* Horizontal display of 3 rolled values */}
                    <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
                      <div className="bg-[#FAF9F6] border border-gray-200/40 rounded-xl p-2.5 text-center flex flex-col items-center justify-center">
                        <span className="text-[10px] text-gray-400">上卦</span>
                        <span className="text-sm font-bold text-gray-800 mt-1">
                          {rolledUpper ? TRIGRAMS[rolledUpper].name : "——"}
                        </span>
                        <span className="text-xs text-[#967520] font-mono">
                          {rolledUpper ? TRIGRAMS[rolledUpper].symbol : "— —"}
                        </span>
                      </div>
                      <div className="bg-[#FAF9F6] border border-gray-200/40 rounded-xl p-2.5 text-center flex flex-col items-center justify-center">
                        <span className="text-[10px] text-gray-400">下卦</span>
                        <span className="text-sm font-bold text-gray-800 mt-1">
                          {rolledLower ? TRIGRAMS[rolledLower].name : "——"}
                        </span>
                        <span className="text-xs text-[#967520] font-mono">
                          {rolledLower ? TRIGRAMS[rolledLower].symbol : "— —"}
                        </span>
                      </div>
                      <div className="bg-[#FAF9F6] border border-gray-200/40 rounded-xl p-2.5 text-center flex flex-col items-center justify-center">
                        <span className="text-[10px] text-gray-400">动爻</span>
                        <span className="text-sm font-bold text-gray-800 mt-1">
                          {rolledMoving ? `${rolledMoving}爻` : "——"}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {rolledMoving ? "1-6爻动" : "— —"}
                        </span>
                      </div>
                    </div>

                    {/* Big Action Button */}
                    <button
                      onClick={handleMeihuaRollSequence}
                      disabled={isRollingDice || rollStep !== "idle"}
                      className="w-full mt-6 flex items-center justify-center gap-2 bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white py-3.5 rounded-2xl font-bold text-xs tracking-wider shadow-md hover:opacity-95 transition-all disabled:opacity-50"
                    >
                      <Sparkles className={cn("w-4 h-4", isRollingDice && "animate-spin")} />
                      <span>
                        {rollStep === "idle" ? "诚心摇骰起卦" : isRollingDice ? "天地乾坤演化中..." : "起卦完成"}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Visual 3D Taiji Bagua Wheel Area */}
                  <div className="bg-[#FFFFFF]/70 backdrop-blur-xl p-5 rounded-3xl border border-gray-200/50 shadow-sm flex flex-col items-center">
                    <span className="text-[10px] text-[#967520] tracking-widest uppercase font-bold mb-1">Qimen Dunjia Cosmic Alignment</span>
                    <h3 className="text-xs text-gray-400 mb-2">点击下方按钮，校对时空方位，排列九宫格局</h3>
                    
                    <div className={cn("transition-transform duration-1000", isRollingDice && "scale-105")}>
                      <BaguaWheel />
                    </div>
                  </div>

                  {/* Query text area */}
                  <div className="bg-[#FFFFFF]/70 backdrop-blur-xl p-6 rounded-3xl border border-gray-200/50 shadow-sm relative overflow-hidden">
                    <h2 className="text-xs font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-[#E6C15C] rounded-full" />
                      所求何事 (心中的疑惑)
                    </h2>
                    <p className="text-[10px] text-gray-400 mb-3">若留空，默认为您泛问自身今日运势。</p>
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="如：今日出行吉凶？事业项目前景如何？（不填默认泛问运势）"
                      className="w-full bg-[#FAF9F5] border border-gray-200/60 rounded-2xl px-4 py-3 text-xs text-[#1C1C1E] min-h-[70px] resize-none focus:outline-none focus:border-[#E6C15C] transition-all placeholder:text-gray-400 leading-relaxed"
                    />

                    {/* Big Action Button */}
                    <button
                      onClick={handleQimenCastSequence}
                      disabled={isRollingDice}
                      className="w-full mt-6 flex items-center justify-center gap-2 bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white py-3.5 rounded-2xl font-bold text-xs tracking-wider shadow-md hover:opacity-95 transition-all disabled:opacity-50"
                    >
                      <Sparkles className={cn("w-4 h-4", isRollingDice && "animate-spin")} />
                      <span>{isRollingDice ? "正在校准时空九宫演盘中..." : "校准时空，诚心排盘"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* History Panel View */}
      <AnimatePresence>
        {activeTab === "history" && (
          <HistoryPanel 
            list={historyList} 
            onSelect={setSelectedHistory} 
            onClear={clearHistory} 
            onDelete={deleteHistoryItem}
            onBack={() => setActiveTab("cast")} 
          />
        )}
      </AnimatePresence>

      {/* Detail Overlay View for history logs and new casts */}
      <AnimatePresence>
        {selectedHistory && (
          <HistoryDetailModal 
            item={selectedHistory} 
            loading={loading}
            followUpLoading={followUpLoading}
            role={role}
            setRole={setRole}
            onClose={() => setSelectedHistory(null)} 
            onInterpret={(chosenRole) => interpretDivination(selectedHistory, chosenRole)}
            onFollowUp={(question) => handleFollowUp(selectedHistory, question)}
            onClearFollowUps={() => handleClearFollowUps(selectedHistory)}
          />
        )}
      </AnimatePresence>

      {/* Balanced Bottom Navigation Bar */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-2xl p-2 rounded-3xl shadow-xl border border-gray-200/50 flex gap-1.5 z-40 w-[92%] max-w-md">
        <button
          onClick={() => { setActiveTab("cast"); }}
          className={cn(
            "flex-1 flex flex-col items-center justify-center py-2.5 rounded-2xl transition-all font-bold text-[10px] gap-1",
            activeTab === "cast" 
              ? "bg-[#FAF9F2] text-[#967520] border border-[#E6C15C]/30 shadow-sm" 
              : "text-gray-500 hover:text-[#1C1C1E]"
          )}
        >
          <Sparkles className="w-4 h-4" />
          <span>卜卦</span>
        </button>
        <button
          onClick={() => { setActiveTab("history"); }}
          className={cn(
            "flex-1 flex flex-col items-center justify-center py-2.5 rounded-2xl transition-all font-bold text-[10px] gap-1",
            activeTab === "history" 
              ? "bg-[#FAF9F2] text-[#967520] border border-[#E6C15C]/30 shadow-sm" 
              : "text-gray-500 hover:text-[#1C1C1E]"
          )}
        >
          <HistoryIcon className="w-4 h-4" />
          <span>解卦历史</span>
        </button>
        <button
          onClick={() => { setActiveTab("settings"); }}
          className={cn(
            "flex-1 flex flex-col items-center justify-center py-2.5 rounded-2xl transition-all font-bold text-[10px] gap-1",
            activeTab === "settings" 
              ? "bg-[#FAF9F2] text-[#967520] border border-[#E6C15C]/30 shadow-sm" 
              : "text-gray-500 hover:text-[#1C1C1E]"
          )}
        >
          <Settings className="w-4 h-4" />
          <span>设置</span>
        </button>
      </nav>
    </div>
  );
}

// Visualization of trigrams as physical lines in parchment format
function HexagramVisualization({ upper, lower, changeLine }: { upper: TrigramInfo; lower: TrigramInfo; changeLine?: number }) {
  const allLines = [...lower.lines, ...upper.lines]; // bottom to top
  return (
    <div className="relative flex flex-col gap-1 w-14 items-center justify-center py-2.5 bg-white rounded-lg border border-gray-100 shadow-sm">
      {allLines.slice().reverse().map((isSolid, idx) => {
        const lineNum = 6 - idx; // 1-indexed from bottom
        const isChanging = changeLine === lineNum;
        return (
          <div key={idx} className="relative w-10 h-1.5 flex justify-between items-center">
            {isSolid ? (
              <div className="w-full h-full bg-gradient-to-r from-[#967520] to-[#E6C15C] rounded-sm" />
            ) : (
              <>
                <div className="w-[42%] h-full bg-gradient-to-r from-[#967520] to-[#E6C15C] rounded-sm" />
                <div className="w-[16%] h-full" />
                <div className="w-[42%] h-full bg-gradient-to-r from-[#967520] to-[#E6C15C] rounded-sm" />
              </>
            )}
            {isChanging && (
              <div className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gradient-to-r from-[#967520] to-[#E6C15C] shadow-[0_0_6px_rgba(230,193,92,0.8)] animate-pulse" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsPanel({ 
  apiKey, 
  model, 
  role, 
  customPrompts,
  onSave, 
  onBack 
}: { 
  apiKey: string, 
  model: "deepseek-v4-flash" | "deepseek-v4-pro", 
  role: "default" | "sister" | "master", 
  customPrompts: CustomPrompts,
  onSave: (key: string, model: any, role: any, updatedPrompts: CustomPrompts) => void, 
  onBack: () => void 
}) {
  const [key, setKey] = useState(apiKey);
  const [chosenModel, setChosenModel] = useState(model);
  const [chosenRole, setChosenRole] = useState(role);
  const [expandedRole, setExpandedRole] = useState<keyof CustomPrompts | null>(role);
  const [promptsState, setPromptsState] = useState<CustomPrompts>(() => {
    return JSON.parse(JSON.stringify(customPrompts));
  });

  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");

  // Keep a ref of the latest settings to perform auto-save on unmount
  const latestSettingsRef = useRef({ key, chosenModel, chosenRole, promptsState });
  latestSettingsRef.current = { key, chosenModel, chosenRole, promptsState };

  useEffect(() => {
    return () => {
      const latest = latestSettingsRef.current;
      onSave(latest.key, latest.chosenModel, latest.chosenRole, latest.promptsState);
    };
  }, [onSave]);

  useEffect(() => {
    setTestStatus("idle");
    setTestMsg("");
  }, [key, chosenModel]);

  const handleTestConnection = async () => {
    if (testStatus === "loading") return;
    setTestStatus("loading");
    setTestMsg("");
    try {
      if (key) {
        // Save immediately when testing connection
        onSave(key, chosenModel, chosenRole, promptsState);
        // Perform client-side verification directly to support serverless/static hosting like Netlify
        const openai = new OpenAI({
          baseURL: "https://api.deepseek.com",
          apiKey: key,
          dangerouslyAllowBrowser: true
        });
        await openai.chat.completions.create({
          model: chosenModel || "deepseek-v4-flash",
          messages: [
            { role: "user", content: "hi" }
          ],
          max_tokens: 10,
          ...(chosenModel === "deepseek-v4-pro" ? {
            thinking: { type: "enabled" },
            reasoning_effort: "high",
          } : {})
        } as any);
        
        setTestStatus("success");
        setTestMsg("DeepSeek API 密钥验证通过，连接顺畅！");
      } else {
        setTestStatus("error");
        setTestMsg("请先在上方输入您的 DeepSeek API Key 才能进行连接测试。如您没有 API Key，可前往 DeepSeek 开放平台 (https://platform.deepseek.com) 注册获取。");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMsg(err.message || "网络请求异常，无法连接服务器");
    }
  };

  const handleRoleSelect = (roleKey: "default" | "sister" | "master") => {
    setChosenRole(roleKey);
    setExpandedRole(roleKey);
  };

  const handlePromptChange = (roleKey: keyof CustomPrompts, field: keyof RolePromptCustom, val: string) => {
    setPromptsState(prev => ({
      ...prev,
      [roleKey]: {
        ...prev[roleKey],
        [field]: val
      }
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="bg-white p-6 rounded-3xl border border-gray-200/50 shadow-sm space-y-6"
    >
      <div>
        <h2 className="text-base font-semibold text-[#1C1C1E] mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#E6C15C] rounded-full" />
          密钥与大模型配置
        </h2>
        <p className="text-xs text-gray-400">配置您的专属大语言模型参数，享受流畅离线算卦体验。</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">DeepSeek API Key (自定义密钥)</label>
          <div className="space-y-2.5">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="填入您的 DeepSeek API Key"
              className="w-full bg-[#FAF9F5] border border-gray-200/60 rounded-2xl px-4 py-3.5 text-xs text-[#1C1C1E] focus:outline-none focus:border-[#E6C15C] transition-all placeholder:text-gray-400"
            />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
              <span className="text-[10px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                <Info className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                <span>
                  {key ? (
                    "系统已配置您的专属 API 密钥。"
                  ) : (
                    <>
                      请先在此输入您的 DeepSeek API Key。
                      <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="text-[#967520] underline hover:text-[#E6C15C] ml-1 font-semibold">
                        点此前往 DeepSeek 官方开放平台获取 ↗
                      </a>
                    </>
                  )}
                </span>
              </span>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus === "loading"}
                className={cn(
                  "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-medium transition-all self-end sm:self-auto",
                  testStatus === "loading"
                    ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                    : testStatus === "success"
                    ? "bg-[#10B981]/10 border-[#10B981]/30 text-[#059669]"
                    : testStatus === "error"
                    ? "bg-[#EF4444]/10 border-[#EF4444]/30 text-[#DC2626]"
                    : "bg-[#FAF9F2] border-[#E6C15C]/40 text-[#967520] hover:bg-[#FAF9F2]/80 active:scale-[0.98]"
                )}
              >
                {testStatus === "loading" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : testStatus === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : testStatus === "error" ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <Wifi className="w-3.5 h-3.5" />
                )}
                {testStatus === "loading" ? "正在测试..." : testStatus === "success" ? "测试成功" : testStatus === "error" ? "测试失败" : "测试 AI 连通性"}
              </button>
            </div>

            {testMsg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-3 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2",
                  testStatus === "success"
                    ? "bg-[#10B981]/5 border-[#10B981]/20 text-[#047857]"
                    : "bg-[#EF4444]/5 border-[#EF4444]/20 text-[#B91C1C]"
                )}
              >
                {testStatus === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-[#EF4444] flex-shrink-0 mt-0.5" />
                )}
                <span>{testMsg}</span>
              </motion.div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">大语言模型</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setChosenModel("deepseek-v4-flash")}
              className={cn(
                "p-2.5 rounded-xl border text-xs transition-all flex flex-col items-center justify-center gap-0.5",
                chosenModel === "deepseek-v4-flash" 
                  ? "bg-[#FAF9F2] border-[#E6C15C] text-[#967520] font-semibold" 
                  : "bg-white border-gray-200 text-gray-500"
              )}
            >
              <span className="font-bold">deepseek-v4-flash</span>
              <span className="text-[9px] text-[#967520]/80">极速响应 / 推荐</span>
            </button>
            <button
              onClick={() => setChosenModel("deepseek-v4-pro")}
              className={cn(
                "p-2.5 rounded-xl border text-xs transition-all flex flex-col items-center justify-center gap-0.5",
                chosenModel === "deepseek-v4-pro" 
                  ? "bg-[#FAF9F2] border-[#E6C15C] text-[#967520] font-semibold" 
                  : "bg-white border-gray-200 text-gray-500"
              )}
            >
              <span className="font-bold">deepseek-v4-pro</span>
              <span className="text-[9px] text-gray-400">深度思维推理</span>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">默认解卦大师角色</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleRoleSelect("default")}
              className={cn(
                "p-2.5 rounded-xl border text-[11px] transition-all",
                chosenRole === "default" 
                  ? "bg-[#FAF9F2] border-[#E6C15C] text-[#967520] font-semibold" 
                  : "bg-white border-gray-200 text-gray-500"
              )}
            >
              金牌命理师
            </button>
            <button
              onClick={() => handleRoleSelect("sister")}
              className={cn(
                "p-2.5 rounded-xl border text-[11px] transition-all",
                chosenRole === "sister" 
                  ? "bg-[#FAF9F2] border-[#E6C15C] text-[#967520] font-semibold" 
                  : "bg-white border-gray-200 text-gray-500"
              )}
            >
              知心大姐姐
            </button>
            <button
              onClick={() => handleRoleSelect("master")}
              className={cn(
                "p-2.5 rounded-xl border text-[11px] transition-all",
                chosenRole === "master" 
                  ? "bg-[#FAF9F2] border-[#E6C15C] text-[#967520] font-semibold" 
                  : "bg-white border-gray-200 text-gray-500"
              )}
            >
              国学大师
            </button>
          </div>
        </div>

        {/* Master Role Prompts custom configuration section */}
        <div className="border-t border-gray-200/60 pt-5 mt-4">
          <h3 className="text-sm font-semibold text-[#1C1C1E] mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#E6C15C] rounded-full" />
            解卦大师角色提示词配置
          </h3>
          <p className="text-xs text-gray-400 mb-4">您可以点击下方的签卡展开或折叠，定制大师的性格特点与解盘语气。</p>
          
          <div className="space-y-4">
            {(["default", "sister", "master"] as const).map((roleKey) => {
              const label = roleKey === "default" ? "金牌命理师" : roleKey === "sister" ? "知心大姐姐" : "国学大师";
              const isExpanded = expandedRole === roleKey;
              const isActive = chosenRole === roleKey;
              
              return (
                <div 
                  key={roleKey} 
                  className={cn(
                    "bg-[#FAF9F5] rounded-2xl border transition-all duration-300 p-4",
                    isExpanded 
                      ? "border-[#E6C15C] shadow-sm bg-white" 
                      : "border-gray-200/50 hover:bg-[#FAF9F2]/40"
                  )}
                >
                  {/* Interactive Header representing drawing a bamboo fortune stick */}
                  <div 
                    onClick={() => setExpandedRole(isExpanded ? null : roleKey)}
                    className="flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Traditional vermilion slip bookmark indicator representing the fortune stick tip */}
                      <div className={cn(
                        "w-1.5 h-5 rounded-full transition-all duration-300",
                        isActive ? "bg-[#C2410C]" : "bg-gray-300"
                      )} />
                      <span className={cn(
                        "text-xs font-bold transition-colors duration-300",
                        isActive ? "text-[#967520]" : "text-gray-600"
                      )}>
                        {label}
                      </span>
                      {isActive && (
                        <span className="text-[9px] bg-[#E6C15C]/15 text-[#967520] border border-[#E6C15C]/30 px-1.5 py-0.5 rounded-full font-semibold">
                          当前启用
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-gray-400 text-[10px]">
                      <span className="font-serif text-gray-400/80">
                        {isExpanded ? "收起" : "配置"}
                      </span>
                      <ChevronRight className={cn(
                        "w-3.5 h-3.5 transition-transform duration-300 text-gray-400",
                        isExpanded && "rotate-90 text-[#967520]"
                      )} />
                    </div>
                  </div>

                  {/* Collapsible content with smooth height and opacity animation */}
                  <motion.div
                    initial={false}
                    animate={{ height: isExpanded ? "auto" : 0, opacity: isExpanded ? 1 : 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pt-4 mt-3 border-t border-dashed border-gray-200/60">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 mb-1">性格特点 (Personality)</label>
                        <input
                          type="text"
                          value={promptsState[roleKey].personality}
                          onChange={(e) => handlePromptChange(roleKey, "personality", e.target.value)}
                          className="w-full bg-white border border-gray-200/60 rounded-xl px-3 py-2 text-xs text-[#1C1C1E] focus:outline-none focus:border-[#E6C15C] transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 mb-1">说话语气与解盘逻辑 (Style/Tone)</label>
                        <textarea
                          value={promptsState[roleKey].style}
                          onChange={(e) => handlePromptChange(roleKey, "style", e.target.value)}
                          rows={3}
                          className="w-full bg-white border border-gray-200/60 rounded-xl px-3 py-2 text-xs text-[#1C1C1E] focus:outline-none focus:border-[#E6C15C] resize-none transition-colors"
                        />
                      </div>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="pt-4 flex gap-3">
          <button 
            onClick={onBack}
            className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-2xl font-medium text-xs hover:bg-[#FAF9F2] transition-colors"
          >
            返回
          </button>
          <button 
            onClick={() => {
              onSave(key, chosenModel, chosenRole, promptsState);
              onBack();
            }}
            className="flex-1 bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white py-3.5 rounded-2xl font-medium text-xs hover:opacity-90 transition-opacity"
          >
            保存配置
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function HistoryPanel({ 
  list, 
  onSelect, 
  onClear, 
  onDelete,
  onBack 
}: { 
  list: DivinationHistoryItem[], 
  onSelect: (item: DivinationHistoryItem) => void, 
  onClear: () => void,
  onDelete: (id: string, e: React.MouseEvent) => void,
  onBack: () => void 
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 top-[72px] bg-[#FAF9F6] z-20 overflow-y-auto px-4 pt-4 pb-32"
    >
      <div className="max-w-xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-[#967520]" />
            <h2 className="text-base font-semibold text-gray-800">解卦起卦记录</h2>
          </div>
          <div className="flex gap-2">
            {list.length > 0 && (
              <button 
                onClick={() => setShowConfirm(true)}
                className="text-xs text-red-500 hover:text-red-400 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-500/5 transition-colors font-bold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空记录
              </button>
            )}
            <button 
              onClick={onBack}
              className="text-xs text-gray-500 hover:text-black px-3 py-1.5 rounded-lg hover:bg-black/5 transition-colors font-bold"
            >
              返回
            </button>
          </div>
        </div>

        {/* Custom Confirmation Modal */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-xl border border-gray-100 text-center space-y-4"
            >
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">确认清空记录？</h3>
                <p className="text-xs text-gray-500 mt-1">此操作将永久删除所有起卦与排局解卦历史，且无法恢复。</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    onClear();
                    setShowConfirm(false);
                  }}
                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  确认清空
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {list.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-md border border-gray-200/50 rounded-3xl p-12 text-center text-gray-400 shadow-sm">
            <Compass className="w-12 h-12 text-gray-300 mx-auto mb-4 stroke-1 animate-pulse" />
            <p className="text-sm font-semibold">暂无历史起卦记录</p>
            <p className="text-xs text-gray-400 mt-1">每次起卦排局都会安全保存于此</p>
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                className="bg-white hover:bg-white/80 p-5 rounded-2xl border border-gray-200/50 cursor-pointer transition-all flex justify-between items-start gap-3 group shadow-sm relative overflow-hidden"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-[10px] font-semibold border",
                      item.method === "meihua" 
                        ? "bg-yellow-500/10 text-[#967520] border-[#E6C15C]/20" 
                        : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                    )}>
                      {item.method === "meihua" ? "梅花易数" : "奇门遁甲"}
                    </span>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1 font-bold">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                    {item.followUps && item.followUps.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1">
                        <MessageSquare className="w-2.5 h-2.5" />
                        <span>{Math.floor(item.followUps.length / 2)}条追问</span>
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-gray-800 line-clamp-1 group-hover:text-[#967520] transition-colors">
                    {item.query}
                  </h4>
                  <p className="text-[10px] text-gray-400 line-clamp-1">
                    {item.timeContext.split('\n')[2] || "时令推演中"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => onDelete(item.id, e)}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#967520] group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function HistoryDetailModal({ 
  item, 
  loading,
  followUpLoading,
  role,
  setRole,
  onClose,
  onInterpret,
  onFollowUp,
  onClearFollowUps
}: { 
  item: DivinationHistoryItem; 
  loading: boolean;
  followUpLoading: boolean;
  role: "default" | "sister" | "master";
  setRole: (r: any) => void;
  onClose: () => void;
  onInterpret: (chosenRole: string) => void;
  onFollowUp: (question: string) => void;
  onClearFollowUps: () => void;
}) {
  const [localRole, setLocalRole] = useState<"default" | "sister" | "master">(role);
  const [followUpInput, setFollowUpInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasResult = Boolean(item.result && item.result !== "等待解卦中...");
  const showInterpretationSection = hasResult || loading;

  const suggestedQuestions = item.method === "meihua" 
    ? [
        "此卦在近期事业或财运上有何关键转机？",
        "针对动爻指引，我当前最该采取什么具体策略？",
        "这件事何时会有明确的定局或突破？",
        "结合体用五行生克，日常如何防范风险与避凶？"
      ]
    : [
        "针对此奇门局，哪个方位对我最为有利？",
        "日干与时干生克，意味着眼前的最大阻碍是什么？",
        "三吉门（开、休、生）落位如何指导接下来的决断？",
        "依据时令节气，此事何时能迎来明显突破？"
      ];

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const submitFollowUp = () => {
    if (!followUpInput.trim() || followUpLoading || loading) return;
    const q = followUpInput.trim();
    setFollowUpInput("");
    onFollowUp(q);
  };

  // Auto scroll to latest message when follow-up is added or updated
  useEffect(() => {
    if (item.followUps && item.followUps.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [item.followUps, followUpLoading]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-gray-200 shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden"
      >
        {/* Modal Top Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-[#FAF9F6]">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#E6C15C]/15 text-[#967520] border border-[#E6C15C]/25">
                {item.method === "meihua" ? "梅花易数卦象" : "奇门遁甲天局"}
              </span>
              {item.followUps && item.followUps.length > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 flex items-center gap-1">
                  <MessageSquare className="w-2.5 h-2.5" />
                  <span>{Math.floor(item.followUps.length / 2)} 轮追问</span>
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-gray-800 mt-1 line-clamp-1">
              求测事项: {item.query}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-gray-200/50 hover:bg-gray-200 rounded-full text-gray-500 hover:text-black transition-colors flex items-center justify-center flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with smooth scrolling */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Spatio-temporal time context card */}
          <div className="bg-[#FAF9F5] p-4 rounded-2xl border border-gray-200 text-xs space-y-1 font-mono text-gray-500 leading-relaxed shadow-inner">
            <h4 className="text-xs font-bold text-gray-800 mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3 bg-[#E6C15C] rounded-full inline-block" />
              时空起卦时令参数
            </h4>
            <pre className="whitespace-pre-wrap font-sans text-gray-600">
              {item.timeContext.trim()}
            </pre>
          </div>

          {/* Render Saved Visual Representation exclusively in correct tab to avoid mix-up */}
          {item.method === "meihua" && item.hexagramInfo && (() => {
            const hexText = ICHING_DATA[item.hexagramInfo.baseName];
            const yaoText = hexText ? hexText.yaos[item.hexagramInfo.changeLine - 1] : "";
            const guaciText = hexText ? hexText.judgment : "";
            
            let yaoLabel = `第 ${item.hexagramInfo.changeLine} 爻`;
            let yaoContent = yaoText;
            if (yaoText && yaoText.includes("：")) {
              const parts = yaoText.split("：");
              yaoLabel = parts[0];
              yaoContent = parts[1];
            }
            
            return (
              <>
                <div className="bg-[#FAF9F5] p-4 rounded-2xl border border-gray-200">
                  <h4 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-1">
                    <span className="w-1 h-3 bg-[#E6C15C] rounded-full inline-block" />
                    梅花易数卦象 (本、互、变卦)
                  </h4>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-gray-400 mb-1">本卦</span>
                      <HexagramVisualization 
                        upper={item.hexagramInfo.baseUpper} 
                        lower={item.hexagramInfo.baseLower} 
                        changeLine={item.hexagramInfo.changeLine} 
                      />
                      <span className="text-xs font-bold text-gray-800 mt-2">{item.hexagramInfo.baseName}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-gray-400 mb-1">互卦</span>
                      <HexagramVisualization upper={item.hexagramInfo.mutualUpper} lower={item.hexagramInfo.mutualLower} />
                      <span className="text-xs font-bold text-gray-800 mt-2">{item.hexagramInfo.mutualName}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-gray-400 mb-1">变卦</span>
                      <HexagramVisualization upper={item.hexagramInfo.changeUpper} lower={item.hexagramInfo.changeLower} />
                      <span className="text-xs font-bold text-gray-800 mt-2">{item.hexagramInfo.changeName}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-3 text-center">
                    动爻在第 <strong className="text-[#967520]">{item.hexagramInfo.changeLine}</strong> 爻
                  </div>
                </div>

                {/* 动爻指引 Card */}
                {yaoText && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white p-5 rounded-2xl border border-gray-150/80 shadow-sm space-y-2 text-left"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#967520]">
                      <span className="w-1.5 h-3 bg-[#967520] rounded-full inline-block" />
                      <span>动爻指引</span>
                      <span className="ml-1 px-1.5 py-0.5 bg-[#967520]/10 text-[10px] rounded text-[#967520] font-mono font-bold">{yaoLabel}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-800 leading-relaxed font-sans">{yaoContent}</p>
                  </motion.div>
                )}

                {/* 卦辞 Card */}
                {guaciText && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white p-5 rounded-2xl border border-gray-150/80 shadow-sm space-y-2 text-left"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#967520]">
                      <span className="w-1.5 h-3 bg-[#E6C15C] rounded-full inline-block" />
                      <span>卦辞</span>
                      <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-[10px] rounded text-gray-500 font-bold">{item.hexagramInfo.baseName}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-700 leading-relaxed font-sans">{guaciText}</p>
                  </motion.div>
                )}
              </>
            );
          })()}

          {item.method === "qimen" && item.qimenInfo && (
            <div className="bg-[#FAF9F5] p-4 rounded-2xl border border-gray-200">
              <h4 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <span className="w-1 h-3 bg-[#E6C15C] rounded-full inline-block" />
                奇门遁甲起卦盘
              </h4>
              
              {item.qimenInfo.bazi && (
                <div className="mb-3 p-3 bg-white border border-gray-100 rounded-xl space-y-2 text-[11px] text-gray-600">
                  <div className="flex justify-between border-b border-gray-50 pb-1.5 flex-wrap gap-1">
                    <span className="font-semibold text-gray-700">干支历：</span>
                    <span className="font-mono text-[#967520]">{item.qimenInfo.bazi.year}年 {item.qimenInfo.bazi.month}月 {item.qimenInfo.bazi.day}日 {item.qimenInfo.bazi.hour}时</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-left">
                    <div className="flex justify-between">
                      <span className="text-gray-400">当前节气：</span>
                      <span className="font-semibold text-gray-800">{item.qimenInfo.jieqi}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">奇门局数：</span>
                      <span className="font-semibold text-[#967520]">{item.qimenInfo.juName} ({item.qimenInfo.dunType})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">时柱旬首：</span>
                      <span className="font-semibold text-gray-800">{item.qimenInfo.xunshou}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">值符值使：</span>
                      <span className="font-semibold text-gray-800">{item.qimenInfo.zhifuStar} / {item.qimenInfo.zhishiGate}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1 bg-gray-200 p-1.5 rounded-2xl overflow-hidden">
                {item.qimenInfo.palaces.map((palace, i) => (
                  <div key={i} className="aspect-square p-2 bg-white flex flex-col justify-between text-center relative hover:bg-[#FAF9F5] transition-colors">
                    <div className="flex justify-between items-center text-[8px] text-gray-400 font-semibold">
                      <span>{palace.god}</span>
                      <span>{palace.direction}</span>
                    </div>
                    <div className="my-1 flex flex-col">
                      <span className="text-[11px] font-bold text-gray-800">{palace.gate}</span>
                      <span className="text-[9px] text-gray-400">{palace.star}</span>
                    </div>
                    <div className="flex justify-between items-end text-[9px] font-bold">
                      <span className="text-[#967520]">{palace.stemHeaven}</span>
                      <span className="text-gray-300 font-mono text-[8px]">{palace.index}</span>
                      <span className="text-gray-400">{palace.stemEarth}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Master Role Cards selection section or live streamed result */}
          {!showInterpretationSection ? (
            <div className="space-y-4 pt-2">
              <div className="border-t border-gray-200/60 pt-4">
                <label className="block text-xs font-bold text-gray-700 mb-2.5">
                  请选择为您指点迷津的解卦大师角色：
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setLocalRole("default")}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 bg-white",
                      localRole === "default" 
                        ? "border-[#E6C15C] bg-[#FAF9F2] text-[#967520] font-semibold" 
                        : "border-gray-200 text-gray-500"
                    )}
                  >
                    <Award className="w-4 h-4 text-[#967520]" />
                    <span className="text-[11px] font-bold">金牌命理师</span>
                  </button>
                  <button
                    onClick={() => setLocalRole("sister")}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 bg-white",
                      localRole === "sister" 
                        ? "border-[#E6C15C] bg-[#FAF9F2] text-[#967520] font-semibold" 
                        : "border-gray-200 text-gray-500"
                    )}
                  >
                    <Heart className="w-4 h-4 text-[#967520]" />
                    <span className="text-[11px] font-bold">知心大姐姐</span>
                  </button>
                  <button
                    onClick={() => setLocalRole("master")}
                    className={cn(
                      "p-3 rounded-2xl border text-center transition-all flex flex-col items-center gap-1 bg-white",
                      localRole === "master" 
                        ? "border-[#E6C15C] bg-[#FAF9F2] text-[#967520] font-semibold" 
                        : "border-gray-200 text-gray-500"
                    )}
                  >
                    <User className="w-4 h-4 text-[#967520]" />
                    <span className="text-[11px] font-bold">国学大师</span>
                  </button>
                </div>
              </div>

              <button
                onClick={() => onInterpret(localRole)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white py-3.5 rounded-2xl font-bold text-xs tracking-wider shadow-sm hover:opacity-95 transition-opacity"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "正在解卦..." : "解卦"}
              </button>
            </div>
          ) : (
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#967520] flex items-center gap-1.5">
                  <span className="w-1.5 h-3 bg-[#E6C15C] rounded-full inline-block" />
                  大师解盘妙答 ({item.role === "sister" ? "知心大姐姐" : item.role === "master" ? "国学大师" : "金牌命理师"})
                </h4>
                <div className="flex items-center gap-3">
                  {hasResult && !loading && (
                    <button
                      onClick={() => handleCopyText(item.result, 'main-result')}
                      className="text-[10px] text-gray-400 hover:text-[#967520] font-semibold flex items-center gap-1 transition-colors"
                      title="复制完整解卦内容"
                    >
                      {copiedId === 'main-result' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>复制解卦</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => onInterpret(localRole)}
                    disabled={loading || followUpLoading}
                    className="text-[10px] text-[#967520] hover:underline font-bold flex items-center gap-1"
                  >
                    {loading ? (
                      <span className="flex items-center gap-1 text-[#967520]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>正在流式推演中...</span>
                      </span>
                    ) : "重新解卦"}
                  </button>
                </div>
              </div>
              
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed bg-[#FAF9F5] p-5 rounded-2xl border border-gray-200/60 shadow-inner min-h-[120px]">
                {loading && !item.result ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-3 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin text-[#967520]" />
                    <span className="text-xs font-serif text-[#967520]">大师正在凝神推演卦象，请稍候...</span>
                  </div>
                ) : (
                  <div>
                    <Markdown>{item.result}</Markdown>
                    {loading && (
                      <span className="inline-block w-2 h-4 bg-[#967520] animate-pulse ml-1 align-middle" />
                    )}
                  </div>
                )}
              </div>

              {/* Follow-up Section (Enabled when original result exists) */}
              {hasResult && !loading && (
                <div className="border-t border-gray-200/70 pt-6 space-y-5">
                  {/* Section Title & Reset Action */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#E6C15C]/20 border border-[#E6C15C]/40 flex items-center justify-center">
                        <MessageSquare className="w-3.5 h-3.5 text-[#967520]" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          卦中深意 · 随心追问
                          {item.followUps && item.followUps.length > 0 && (
                            <span className="px-1.5 py-0.5 bg-[#FAF9F2] text-[#967520] border border-[#E6C15C]/30 text-[9px] rounded-full font-bold">
                              {Math.floor(item.followUps.length / 2)} 轮对话
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-gray-400">紧扣本卦/天局格局，可随时向大师追问事态演变、抉择方向或化解之法</p>
                      </div>
                    </div>

                    {item.followUps && item.followUps.length > 0 && (
                      <button
                        onClick={onClearFollowUps}
                        disabled={followUpLoading}
                        className="text-[10px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 font-semibold"
                        title="清空本局追问记录"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>重置追问</span>
                      </button>
                    )}
                  </div>

                  {/* Multi-turn Follow-up Messages Flow */}
                  {item.followUps && item.followUps.length > 0 && (
                    <div className="space-y-4 pt-1">
                      {item.followUps.map((msg, index) => {
                        const isUser = msg.role === 'user';
                        return (
                          <motion.div
                            key={msg.id || index}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              "flex gap-2.5 items-start",
                              isUser ? "flex-row-reverse" : "flex-row"
                            )}
                          >
                            {/* Avatar */}
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs shadow-sm mt-0.5",
                              isUser 
                                ? "bg-[#1C1C1E] text-white" 
                                : "bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white"
                            )}>
                              {isUser ? (
                                <User className="w-3.5 h-3.5" />
                              ) : item.role === "sister" ? (
                                <Heart className="w-3.5 h-3.5" />
                              ) : item.role === "master" ? (
                                <User className="w-3.5 h-3.5" />
                              ) : (
                                <Award className="w-3.5 h-3.5" />
                              )}
                            </div>

                            {/* Speech Bubble */}
                            <div className={cn(
                              "max-w-[85%] rounded-2xl p-4 text-xs shadow-sm",
                              isUser 
                                ? "bg-[#2C2C2E] text-white rounded-tr-sm" 
                                : "bg-[#FAF9F5] border border-gray-200/70 text-gray-800 rounded-tl-sm prose prose-sm leading-relaxed"
                            )}>
                              {isUser ? (
                                <p className="whitespace-pre-wrap leading-relaxed m-0">{msg.content}</p>
                              ) : (
                                <div>
                                  {followUpLoading && !msg.content ? (
                                    <div className="flex items-center gap-2 text-gray-400 py-1">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#967520]" />
                                      <span className="text-[11px] text-[#967520] font-serif">大师正在依卦深析，请稍候...</span>
                                    </div>
                                  ) : (
                                    <div>
                                      <Markdown>{msg.content}</Markdown>
                                      {followUpLoading && index === item.followUps!.length - 1 && (
                                        <span className="inline-block w-1.5 h-3 bg-[#967520] animate-pulse ml-1 align-middle" />
                                      )}
                                    </div>
                                  )}

                                  {msg.content && !followUpLoading && (
                                    <div className="mt-2.5 pt-2 border-t border-gray-200/40 flex justify-end">
                                      <button
                                        onClick={() => handleCopyText(msg.content, msg.id)}
                                        className="text-[9px] text-gray-400 hover:text-[#967520] flex items-center gap-1 font-semibold transition-colors"
                                      >
                                        {copiedId === msg.id ? (
                                          <>
                                            <Check className="w-3 h-3 text-emerald-600" />
                                            <span className="text-emerald-600">已复制</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>复制回复</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}

                  {/* Quick Inspiration Chips */}
                  <div className="pt-2">
                    <span className="text-[10px] text-gray-400 block mb-1.5 font-semibold">
                      💡 快捷追问灵感（点击即可填入）：
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedQuestions.map((qText, qIdx) => (
                        <button
                          key={qIdx}
                          onClick={() => setFollowUpInput(qText)}
                          disabled={followUpLoading}
                          className="text-[10px] bg-white hover:bg-[#FAF9F2] text-gray-600 hover:text-[#967520] border border-gray-200/80 hover:border-[#E6C15C] px-2.5 py-1 rounded-xl transition-all text-left line-clamp-1"
                        >
                          {qText}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chat Input Field & Send Button */}
                  <div className="pt-1">
                    <div className="relative bg-[#FAF9F5] rounded-2xl border border-gray-200/80 focus-within:border-[#E6C15C] focus-within:bg-white transition-all shadow-inner p-3">
                      <textarea
                        value={followUpInput}
                        onChange={(e) => setFollowUpInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submitFollowUp();
                          }
                        }}
                        placeholder="对当前卦象有何追问？输入如：“那我近期适合跳槽吗？”、“具体该如何应对？”..."
                        rows={2}
                        disabled={followUpLoading || loading}
                        className="w-full bg-transparent text-xs text-[#1C1C1E] resize-none focus:outline-none placeholder:text-gray-400 leading-relaxed pr-2"
                      />
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200/40 text-[10px] text-gray-400">
                        <span className="font-mono">按 Enter 键发送 · Shift+Enter 换行</span>
                        <button
                          onClick={submitFollowUp}
                          disabled={!followUpInput.trim() || followUpLoading || loading}
                          className={cn(
                            "px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm",
                            followUpInput.trim() && !followUpLoading && !loading
                              ? "bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white hover:opacity-90 cursor-pointer"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          )}
                        >
                          {followUpLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>{followUpLoading ? "推演中" : "追问"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-4 border-t border-gray-100 bg-[#FAF9F6] flex justify-end">
          <button
            onClick={onClose}
            className="bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md hover:opacity-95 transition-opacity"
          >
            合卦闭目
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
