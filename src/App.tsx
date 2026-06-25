import React, { useState, useEffect } from "react";
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
  Wifi
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
  TRIGRAMS, 
  getCustomJieQi,
  getPreciseJieQi,
  type MeihuaResult, 
  type QimenPalace, 
  type TrigramInfo 
} from "./utils/divination";
import { ICHING_DATA } from "./utils/ichingData";
import type { DivinationMethod, DivinationResponse } from "./types";

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

  const callServerProxy = async (
    method: DivinationMethod, 
    finalQuery: string, 
    timeContext: string,
    currentMeihua: any,
    currentQimen: any,
    chosenRole?: string
  ) => {
    const res = await fetch("/api/divinate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method,
        query: finalQuery,
        timeContext,
        userApiKey: apiKey,
        model,
        role: chosenRole || role,
        hexagramInfo: currentMeihua,
        qimenInfo: currentQimen,
        customPrompts: customPrompts
      }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }
    const data: DivinationResponse = await res.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data.result || "无法解析结果。";
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
    try {
      let interpretation = "";
      
      const selectedR = chosenRole || role;
      const targetPrompt = customPrompts[selectedR as keyof typeof customPrompts] || customPrompts.default;
      const rolePrompt = `
当前解卦大师设定：
- 角色性格：${targetPrompt.personality}
- 说话语气与解盘逻辑：${targetPrompt.style}
`;

      let systemInstruction = "";
      let prompt = "";

      if (targetItem.method === "meihua") {
        systemInstruction = `
你是一位精通中国传统易学数术【梅花易数】的殿堂级宗师。
现在，请根据用户的起卦时空与心中所求，为您进行深度且具象的梅花易数解卦。

【重要：本次解卦采用的术数是：梅花易数】
【绝对禁止混淆：不要提及任何奇门遁甲概念（如九宫、八神、九星、八门、值符值使、三奇六仪等）。仅采用易经体用五行生克、八卦卦象、本卦、互卦、变卦、卦辞、动爻进行预测解卦。】

${rolePrompt}

起卦推演核心参考数据：
---
梅花易数起卦分析数据：
本卦: ${targetItem.hexagramInfo?.baseName || '待定'}（上卦: ${targetItem.hexagramInfo?.baseUpper?.name || ''}${targetItem.hexagramInfo?.baseUpper?.element || ''}，下卦: ${targetItem.hexagramInfo?.baseLower?.name || ''}${targetItem.hexagramInfo?.baseLower?.element || ''}）
互卦: ${targetItem.hexagramInfo?.mutualName || '待定'}（上卦: ${targetItem.hexagramInfo?.mutualUpper?.name || ''}${targetItem.hexagramInfo?.mutualUpper?.element || ''}，下卦: ${targetItem.hexagramInfo?.mutualLower?.name || ''}${targetItem.hexagramInfo?.mutualLower?.element || ''}）
变卦: ${targetItem.hexagramInfo?.changeName || '待定'}（上卦: ${targetItem.hexagramInfo?.changeUpper?.name || ''}${targetItem.hexagramInfo?.changeUpper?.element || ''}，下卦: ${targetItem.hexagramInfo?.changeLower?.name || ''}${targetItem.hexagramInfo?.changeLower?.element || ''}）
动爻: 第 ${targetItem.hexagramInfo?.changeLine || '0'} 爻动
---

请严格遵照上述【解卦大师设定】进行解卦，回答必须使用 Markdown 格式。包含：
1. 本卦、互卦、变卦的卦象五行体用总论。
2. 针对求问事宜进行深刻细节解读（体用关系如何显示当前处境、发展变数及未来最终结果）。
3. 给出实用的、富有人生智慧的卦象化解建议与改运吉凶指引。
`;

        prompt = `
【本次测算方法：梅花易数 (绝非奇门遁甲)】
测算术数: 梅花易数
时令时空: ${targetItem.timeContext}
求问事宜: ${targetItem.query}

请为我进行深度起卦推演与解卦分析。
`;

      } else {
        // Qimen Dunjia
        systemInstruction = `
你是一位精通中国传统易学数术【奇门遁甲】的殿堂级宗师。
现在，请根据用户的起卦时空与心中所求，为您进行深度且具象的奇门遁甲解盘。

【重要：本次解卦采用的术数是：奇门遁甲】
【绝对禁止混淆：不要提及任何梅花易数概念（如本卦、互卦、变卦、体卦用卦、动爻等）。仅采用奇门遁甲九宫生克、天盘地盘、神星门仪组合生克、值符值使进行预测解盘。】

${rolePrompt}

起卦推演核心参考数据：
---
奇门遁甲排盘分析数据：
时令参数: ${targetItem.qimenInfo?.dunInfo || '待定'}
九宫格各宫落位参数: ${JSON.stringify(targetItem.qimenInfo?.palaces || [])}
---

请严格遵照上述【解卦大师设定】进行解卦，回答必须使用 Markdown 格式。包含：
1. 奇门盘面时令总评、值符值使落宫吉凶。
2. 盘面核心用神细节解读（神星门仪组合生克关系，分析事情的当前阻碍、推进趋势和未来结论）。
3. 针对求问疑惑提供明确的行为指引、有利时空方位与开运趋避建议。
`;

        prompt = `
【本次测算方法：奇门遁甲 (绝非梅花易数)】
测算术数: 奇门遁甲
时令时空: ${targetItem.timeContext}
求问事宜: ${targetItem.query}

请为我进行深度起卦推演与解盘分析。
`;
      }

      if (apiKey) {
        const openai = new OpenAI({
          baseURL: "https://api.deepseek.com",
          apiKey: apiKey,
          dangerouslyAllowBrowser: true
        });

        const completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt }
          ],
          ...(model === "deepseek-v4-pro" ? {
            thinking: { type: "enabled" },
            reasoning_effort: "high",
          } : {})
        } as any);

        interpretation = completion.choices[0].message.content || "未能获取解卦结果。";
      } else {
        interpretation = await callServerProxy(targetItem.method, targetItem.query, targetItem.timeContext, targetItem.hexagramInfo, targetItem.qimenInfo, selectedR);
      }

      const fullyInterpretedItem: DivinationHistoryItem = {
        ...targetItem,
        result: interpretation,
        role: selectedR
      };

      setSelectedHistory(fullyInterpretedItem);

      // Persist permanently in local historical log
      const updatedHistory = historyList.map(h => h.id === targetItem.id ? fullyInterpretedItem : h);
      setHistoryList(updatedHistory);
      localStorage.setItem("divination_history", JSON.stringify(updatedHistory));

    } catch (err: any) {
      alert(`解卦推算失败: ${err.message || "未知错误"}`);
    } finally {
      setLoading(false);
    }
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
            role={role}
            setRole={setRole}
            onClose={() => setSelectedHistory(null)} 
            onInterpret={(chosenRole) => interpretDivination(selectedHistory, chosenRole)}
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

  useEffect(() => {
    setTestStatus("idle");
    setTestMsg("");
  }, [key, chosenModel]);

  const handleTestConnection = async () => {
    if (testStatus === "loading") return;
    setTestStatus("loading");
    setTestMsg("");
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: key,
          model: chosenModel
        })
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
        setTestMsg(data.message);
      } else {
        setTestStatus("error");
        setTestMsg(data.error || "连接测试失败，请重试");
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
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                {key ? "系统将使用您的自定义 API 密钥连接 DeepSeek" : "未填写自定义密钥时，自动使用内置官方通道"}
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
                "p-2.5 rounded-xl border text-xs transition-all",
                chosenModel === "deepseek-v4-flash" 
                  ? "bg-[#FAF9F2] border-[#E6C15C] text-[#967520] font-semibold" 
                  : "bg-white border-gray-200 text-gray-500"
              )}
            >
              deepseek-v4-flash
            </button>
            <button
              onClick={() => setChosenModel("deepseek-v4-pro")}
              className={cn(
                "p-2.5 rounded-xl border text-xs transition-all",
                chosenModel === "deepseek-v4-pro" 
                  ? "bg-[#FAF9F2] border-[#E6C15C] text-[#967520] font-semibold" 
                  : "bg-white border-gray-200 text-gray-500"
              )}
            >
              deepseek-v4-pro
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
  role,
  setRole,
  onClose,
  onInterpret
}: { 
  item: DivinationHistoryItem; 
  loading: boolean;
  role: "default" | "sister" | "master";
  setRole: (r: any) => void;
  onClose: () => void;
  onInterpret: (chosenRole: string) => void;
}) {
  const [localRole, setLocalRole] = useState<"default" | "sister" | "master">(role);
  const isInterpreted = item.result && item.result !== "等待解卦中...";

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
        className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl border border-gray-200 shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden"
      >
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-[#FAF9F6]">
          <div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#E6C15C]/15 text-[#967520] border border-[#E6C15C]/25">
              {item.method === "meihua" ? "梅花易数卦象" : "奇门遁甲天局"}
            </span>
            <h3 className="text-sm font-bold text-gray-800 mt-1 line-clamp-1">
              求测事项: {item.query}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-gray-200/50 hover:bg-gray-200 rounded-full text-gray-500 hover:text-black transition-colors flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
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

          {/* Master Role Cards selection section displayed during interpretation */}
          {!isInterpreted ? (
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
                <button
                  onClick={() => onInterpret(localRole)}
                  disabled={loading}
                  className="text-[10px] text-[#967520] hover:underline font-bold flex items-center gap-1"
                >
                  {loading ? "重新解卦中..." : "重新解卦"}
                </button>
              </div>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed bg-[#FAF9F5] p-5 rounded-2xl border border-gray-200/60 shadow-inner">
                <Markdown>{item.result}</Markdown>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-[#FAF9F6] flex justify-end">
          <button
            onClick={onClose}
            className="bg-gradient-to-tr from-[#967520] to-[#E6C15C] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md"
          >
            合卦闭目
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
