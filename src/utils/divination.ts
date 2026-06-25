// Traditional Divination Calculator for Meihua Yishu & Qimen Dunjia
import { Lunar, Solar } from "lunar-javascript";

export interface TrigramInfo {
  name: string;
  symbol: string;
  lines: [boolean, boolean, boolean]; // true for Yang, false for Yin
  number: number;
  element: string;
}

export const TRIGRAMS: Record<number, TrigramInfo> = {
  1: { name: "乾", symbol: "☰", lines: [true, true, true], number: 1, element: "金" },
  2: { name: "兑", symbol: "☱", lines: [false, true, true], number: 2, element: "金" },
  3: { name: "离", symbol: "☲", lines: [true, false, true], number: 3, element: "火" },
  4: { name: "震", symbol: "☳", lines: [false, false, true], number: 4, element: "木" },
  5: { name: "巽", symbol: "☴", lines: [true, true, false], number: 5, element: "木" },
  6: { name: "坎", symbol: "☵", lines: [false, true, false], number: 6, element: "水" },
  7: { name: "艮", symbol: "☶", lines: [true, false, false], number: 7, element: "土" },
  8: { name: "坤", symbol: "☷", lines: [false, false, false], number: 8, element: "土" },
};

// Map number of lines to Hexagram names
export function getHexagramName(upper: number, lower: number): string {
  const matrix: Record<string, string> = {
    "1,1": "乾为天", "1,2": "天泽履", "1,3": "天火同人", "1,4": "天雷无妄", "1,5": "天风姤", "1,6": "天水讼", "1,7": "天山遁", "1,8": "天地否",
    "2,1": "泽天夬", "2,2": "兑为泽", "2,3": "泽火革", "2,4": "泽雷随", "2,5": "泽风大过", "2,6": "泽水困", "2,7": "泽山咸", "2,8": "泽地萃",
    "3,1": "火天大有", "3,2": "火泽睽", "3,3": "离为火", "3,4": "火雷噬嗑", "3,5": "火风鼎", "3,6": "火水未济", "3,7": "火山旅", "3,8": "火地晋",
    "4,1": "雷天大壮", "4,2": "雷泽归妹", "4,3": "雷火丰", "4,4": "震为雷", "4,5": "雷风恒", "4,6": "雷水解", "4,7": "雷山小过", "4,8": "雷地豫",
    "5,1": "风天小畜", "5,2": "风泽中孚", "5,3": "风火家人", "5,4": "风雷益", "5,5": "巽为风", "5,6": "风水涣", "5,7": "风山渐", "5,8": "风地观",
    "6,1": "水天需", "6,2": "水泽节", "6,3": "水火既济", "6,4": "水雷屯", "6,5": "水风井", "6,6": "坎为水", "6,7": "水山蹇", "6,8": "水地比",
    "7,1": "山天大畜", "7,2": "山泽损", "7,3": "山火贲", "7,4": "山雷颐", "7,5": "山风蛊", "7,6": "山水蒙", "7,7": "艮为山", "7,8": "山地剥",
    "8,1": "地天泰", "8,2": "地泽临", "8,3": "地火明夷", "8,4": "地雷复", "8,5": "地风升", "8,6": "地水师", "8,7": "地山谦", "8,8": "坤为地",
  };
  return matrix[`${upper},${lower}`] || "未知卦象";
}

export interface MeihuaResult {
  baseUpper: TrigramInfo;
  baseLower: TrigramInfo;
  baseName: string;
  mutualUpper: TrigramInfo;
  mutualLower: TrigramInfo;
  mutualName: string;
  changeUpper: TrigramInfo;
  changeLower: TrigramInfo;
  changeName: string;
  changeLine: number;
}

export function calculateMeihua(date: Date): MeihuaResult {
  const lunar = Lunar.fromDate(date);
  
  // Convert branch names to values (子=1, 丑=2, ...)
  const branchMap: Record<string, number> = {
    "子": 1, "丑": 2, "寅": 3, "卯": 4, "辰": 5, "巳": 6,
    "午": 7, "未": 8, "申": 9, "酉": 10, "戌": 11, "亥": 12
  };

  const yearBranch = lunar.getYearInGanZhi().slice(-1);
  const yearNum = branchMap[yearBranch] || 1;
  const monthNum = lunar.getMonth();
  const dayNum = lunar.getDay();
  const timeBranch = lunar.getTimeInGanZhi().slice(-1);
  const timeNum = branchMap[timeBranch] || 1;

  // 1. Calculate base upper & lower trigram
  let upperNum = (yearNum + monthNum + dayNum) % 8;
  if (upperNum === 0) upperNum = 8;
  
  let lowerNum = (yearNum + monthNum + dayNum + timeNum) % 8;
  if (lowerNum === 0) lowerNum = 8;

  const baseUpper = TRIGRAMS[upperNum];
  const baseLower = TRIGRAMS[lowerNum];
  const baseName = getHexagramName(upperNum, lowerNum);

  // 2. Calculate Mutual Trigram (互卦)
  // Mutual upper lines are made of base lines [2, 3, 4] of original combined hexagram (counting from bottom, 1-indexed)
  // Combined hexagram has 6 lines from bottom to top: lines 1,2,3 (lower trigram) and lines 4,5,6 (upper trigram)
  const baseCombinedLines: boolean[] = [
    ...baseLower.lines, // indices 0, 1, 2
    ...baseUpper.lines  // indices 3, 4, 5
  ];

  // Mutual lower trigram lines = original lines [2, 3, 4] (indices 1, 2, 3)
  const mutualLowerLines: [boolean, boolean, boolean] = [
    baseCombinedLines[1],
    baseCombinedLines[2],
    baseCombinedLines[3]
  ];

  // Mutual upper trigram lines = original lines [3, 4, 5] (indices 2, 3, 4)
  const mutualUpperLines: [boolean, boolean, boolean] = [
    baseCombinedLines[2],
    baseCombinedLines[3],
    baseCombinedLines[4]
  ];

  const findTrigramByLines = (lines: [boolean, boolean, boolean]): TrigramInfo => {
    return Object.values(TRIGRAMS).find(
      t => t.lines[0] === lines[0] && t.lines[1] === lines[1] && t.lines[2] === lines[2]
    ) || TRIGRAMS[8];
  };

  const mutualUpper = findTrigramByLines(mutualUpperLines);
  const mutualLower = findTrigramByLines(mutualLowerLines);
  const mutualName = getHexagramName(mutualUpper.number, mutualLower.number);

  // 3. Calculate Change Trigram (变卦)
  let changeLine = (yearNum + monthNum + dayNum + timeNum) % 6;
  if (changeLine === 0) changeLine = 6;

  const changeCombinedLines = [...baseCombinedLines];
  // Invert the moving line (1-indexed from bottom)
  changeCombinedLines[changeLine - 1] = !changeCombinedLines[changeLine - 1];

  const changeLowerLines: [boolean, boolean, boolean] = [
    changeCombinedLines[0],
    changeCombinedLines[1],
    changeCombinedLines[2]
  ];

  const changeUpperLines: [boolean, boolean, boolean] = [
    changeCombinedLines[3],
    changeCombinedLines[4],
    changeCombinedLines[5]
  ];

  const changeUpper = findTrigramByLines(changeUpperLines);
  const changeLower = findTrigramByLines(changeLowerLines);
  const changeName = getHexagramName(changeUpper.number, changeLower.number);

  return {
    baseUpper,
    baseLower,
    baseName,
    mutualUpper,
    mutualLower,
    mutualName,
    changeUpper,
    changeLower,
    changeName,
    changeLine
  };
}

export interface QimenPalace {
  index: number; // 1 to 9 corresponding to Luo Shu Palaces
  name: string; // Xun, Li, Kun, Zhen, Zhong, Dui, Gen, Kan, Qian
  direction: string;
  stemHeaven: string; // Celestial stem on Heaven plate
  stemEarth: string;  // Celestial stem on Earth plate
  star: string;       // 九星
  gate: string;       // 八门
  god: string;        // 八神
  element: string;    // 五行
}

export interface QimenResult {
  palaces: QimenPalace[];
  jieqi: string;
  dunInfo: string;
  bazi?: {
    year: string;
    month: string;
    day: string;
    hour: string;
  };
  dunType?: "阳遁" | "阴遁";
  juNum?: number;
  juName?: string;
  xunshou?: string;
  zhifuStar?: string;
  zhishiGate?: string;
}

// Helper to determine precise solar term
export function getPreciseJieQi(date: Date): string {
  const year = date.getFullYear();
  const targetTime = date.getTime();

  const lunarYears = [year - 1, year, year + 1];
  const terms: { name: string; time: number }[] = [];

  const chineseTerms = [
    "小寒", "大寒", "立春", "雨水", "惊蛰", "春分",
    "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
    "小暑", "大暑", "立秋", "处暑", "白露", "秋分",
    "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"
  ];

  for (const ly of lunarYears) {
    const l = Lunar.fromYmd(ly, 6, 1);
    const table = l.getJieQiTable();
    for (const name of chineseTerms) {
      if (table[name]) {
        const s = table[name];
        const tDate = new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
        terms.push({ name, time: tDate.getTime() });
      }
    }
  }

  terms.sort((a, b) => a.time - b.time);

  for (let i = 0; i < terms.length - 1; i++) {
    if (targetTime >= terms[i].time && targetTime < terms[i + 1].time) {
      return terms[i].name;
    }
  }

  if (terms.length > 0) {
    if (targetTime < terms[0].time) return terms[0].name;
    return terms[terms.length - 1].name;
  }

  return "未知";
}

export function calculateQimen(date: Date): QimenResult {
  const lunar = Lunar.fromDate(date);

  // 1. Get precise Bazi (pillars)
  const baziYear = lunar.getYearInGanZhi();
  const baziMonth = lunar.getMonthInGanZhi();
  const baziDay = lunar.getDayInGanZhi();
  const baziHour = lunar.getTimeInGanZhi();

  // 2. Get precise solar term
  const jieqi = getPreciseJieQi(date);

  // 3. Determine Yang Dun / Yin Dun
  const yangTerms = ["冬至", "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种"];
  const dunType: "阳遁" | "阴遁" = yangTerms.includes(jieqi) ? "阳遁" : "阴遁";
  const isYangDun = dunType === "阳遁";

  // 4. Chaibu Ju Number calculation
  const juTable: Record<string, [number, number, number]> = {
    "冬至": [1, 7, 4], "小寒": [2, 8, 5], "大寒": [3, 9, 6],
    "立春": [8, 5, 2], "雨水": [9, 6, 3], "惊蛰": [1, 7, 4],
    "春分": [3, 9, 6], "清明": [4, 1, 7], "谷雨": [5, 2, 8],
    "立夏": [4, 1, 7], "小满": [5, 2, 8], "芒种": [6, 3, 9],
    "夏至": [9, 3, 6], "小暑": [8, 2, 5], "大暑": [7, 1, 4],
    "立秋": [2, 5, 8], "处暑": [1, 4, 7], "白露": [9, 3, 6],
    "秋分": [7, 1, 4], "寒露": [6, 9, 3], "霜降": [5, 8, 2],
    "立冬": [6, 9, 3], "小雪": [5, 8, 2], "大雪": [4, 7, 1]
  };

  const dayBranch = baziDay[1];
  let cycleIdx = 0; // 0=Upper, 1=Middle, 2=Lower
  const upperBranches = ["子", "午", "卯", "酉"];
  const middleBranches = ["寅", "申", "巳", "亥"];
  const lowerBranches = ["辰", "戌", "丑", "未"];

  if (upperBranches.includes(dayBranch)) {
    cycleIdx = 0;
  } else if (middleBranches.includes(dayBranch)) {
    cycleIdx = 1;
  } else if (lowerBranches.includes(dayBranch)) {
    cycleIdx = 2;
  }

  const termJuList = juTable[jieqi] || [1, 7, 4];
  const juNum = termJuList[cycleIdx];
  const juName = `${isYangDun ? "阳" : "阴"}${["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][juNum]}局`;

  // 5. Xunshou calculation for Hour Pillar
  const SixtyGanZhi = [
    "甲子", "乙丑", "丙寅", "丁卯", "戊辰", "己巳", "庚午", "辛未", "壬申", "癸酉",
    "甲戌", "乙亥", "丙子", "丁丑", "戊寅", "己卯", "庚辰", "辛巳", "壬午", "癸未",
    "甲申", "乙酉", "丙戌", "丁亥", "戊子", "己丑", "庚寅", "辛卯", "壬辰", "癸巳",
    "甲午", "乙未", "丙申", "丁酉", "戊戌", "己亥", "庚子", "辛丑", "壬寅", "癸卯",
    "甲辰", "乙巳", "丙午", "丁未", "戊申", "己酉", "庚戌", "辛亥", "壬子", "癸丑",
    "甲寅", "乙卯", "丙辰", "丁巳", "戊午", "己未", "庚申", "辛酉", "壬戌", "癸亥"
  ];

  const hourIdx = SixtyGanZhi.indexOf(baziHour);
  const xunshouIdx = hourIdx >= 0 ? Math.floor(hourIdx / 10) * 10 : 0;
  const xunshou = SixtyGanZhi[xunshouIdx];

  const xunshouStems: Record<string, string> = {
    "甲子": "戊", "甲戌": "己", "甲申": "庚", "甲午": "辛", "甲辰": "壬", "甲寅": "癸"
  };
  const xunshouStem = xunshouStems[xunshou] || "戊";

  // 6. Earth Plate stems
  const stemsSeq = ["戊", "己", "庚", "辛", "壬", "癸", "丁", "丙", "乙"];
  const earthStems: Record<number, string> = {};
  for (let i = 0; i < 9; i++) {
    let p = 1;
    if (isYangDun) {
      p = (juNum - 1 + i) % 9 + 1;
    } else {
      p = (juNum - 1 - i + 18) % 9 + 1;
    }
    earthStems[p] = stemsSeq[i];
  }

  // Find Xunshou's Earth Plate palace (P_start)
  let P_start = 1;
  for (let p = 1; p <= 9; p++) {
    if (earthStems[p] === xunshouStem) {
      P_start = p;
      break;
    }
  }

  // 7. Value stars & gates (值符 / 值使)
  const origStars: Record<number, string> = {
    1: "天蓬", 2: "天芮", 3: "天冲", 4: "天辅", 5: "天禽", 6: "天心", 7: "天柱", 8: "天任", 9: "天英"
  };
  const origGates: Record<number, string> = {
    1: "休门", 2: "死门", 3: "伤门", 4: "杜门", 5: "中门", 6: "开门", 7: "惊门", 8: "生门", 9: "景门"
  };

  const zhifuStar = origStars[P_start] || "天芮";
  const zhishiGate = origGates[P_start] || "死门";

  // 8. Place Values on Heaven Plate (值符星 to Hour Stem palace)
  const hourStemInput = baziHour[0];
  let targetStem = hourStemInput;
  if (hourStemInput === "甲") {
    targetStem = xunshouStem;
  }

  let P_target_star = 1;
  for (let p = 1; p <= 9; p++) {
    if (earthStems[p] === targetStem) {
      P_target_star = p;
      break;
    }
  }

  // 9. Flying Nine Stars
  const heavenStars: Record<number, string> = {};
  for (let p = 1; p <= 9; p++) {
    const star = origStars[p];
    const diff = p - P_start;
    let p_new = 1;
    if (isYangDun) {
      p_new = (P_target_star - 1 + diff + 18) % 9 + 1;
    } else {
      p_new = (P_target_star - 1 - diff + 18) % 9 + 1;
    }
    heavenStars[p_new] = star;
  }

  // 10. Flying Nine Gates
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const xunBranch = xunshou[1];
  const hourBranch = baziHour[1];
  const idx_xun = branches.indexOf(xunBranch);
  const idx_hour = branches.indexOf(hourBranch);
  const steps = (idx_hour - idx_xun + 12) % 12;

  let P_target_gate = 1;
  if (isYangDun) {
    P_target_gate = (P_start - 1 + steps) % 9 + 1;
  } else {
    P_target_gate = (P_start - 1 - steps + 18) % 9 + 1;
  }

  const heavenGates: Record<number, string> = {};
  for (let p = 1; p <= 9; p++) {
    const gate = origGates[p];
    const diff = p - P_start;
    let p_new = 1;
    if (isYangDun) {
      p_new = (P_target_gate - 1 + diff + 18) % 9 + 1;
    } else {
      p_new = (P_target_gate - 1 - diff + 18) % 9 + 1;
    }
    heavenGates[p_new] = gate;
  }

  // 11. Flying Heaven Plate Stems
  const heavenStems: Record<number, string> = {};
  for (let p = 1; p <= 9; p++) {
    const stem = earthStems[p];
    const diff = p - P_start;
    let p_new = 1;
    if (isYangDun) {
      p_new = (P_target_star - 1 + diff + 18) % 9 + 1;
    } else {
      p_new = (P_target_star - 1 - diff + 18) % 9 + 1;
    }
    heavenStems[p_new] = stem;
  }

  // 12. Flying Nine Gods (using Value star palace as seed)
  const gods = ["值符", "螣蛇", "太阴", "六合", "勾陈", "太常", "朱雀", "九地", "九天"];
  const heavenGods: Record<number, string> = {};
  for (let i = 0; i < 9; i++) {
    let p_god = 1;
    if (isYangDun) {
      p_god = (P_target_star - 1 + i) % 9 + 1;
    } else {
      p_god = (P_target_star - 1 - i + 18) % 9 + 1;
    }
    heavenGods[p_god] = gods[i];
  }

  // Create final structured Nine Palaces
  const palaceConfigs = [
    { index: 4, name: "巽宫", direction: "东南", element: "木" },
    { index: 9, name: "离宫", direction: "正南", element: "火" },
    { index: 2, name: "坤宫", direction: "西南", element: "土" },
    { index: 3, name: "震宫", direction: "正东", element: "木" },
    { index: 5, name: "中宫", direction: "中宫", element: "土" },
    { index: 7, name: "兑宫", direction: "正西", element: "金" },
    { index: 8, name: "艮宫", direction: "东北", element: "土" },
    { index: 1, name: "坎宫", direction: "正北", element: "水" },
    { index: 6, name: "乾宫", direction: "西北", element: "金" }
  ];

  const palaces = palaceConfigs.map(p => {
    return {
      index: p.index,
      name: p.name,
      direction: p.direction,
      stemHeaven: heavenStems[p.index] || "",
      stemEarth: earthStems[p.index] || "",
      star: heavenStars[p.index] || "",
      gate: heavenGates[p.index] === "中门" ? "中门" : (heavenGates[p.index] || ""),
      god: heavenGods[p.index] || "",
      element: p.element
    };
  });

  const bazi = {
    year: baziYear,
    month: baziMonth,
    day: baziDay,
    hour: baziHour
  };

  const dunInfo = `${jieqi}节气 ${juName} 时柱旬首:${xunshou} 值符:${zhifuStar} 值使:${zhishiGate}`;

  return {
    palaces,
    jieqi,
    dunInfo,
    bazi,
    dunType,
    juNum,
    juName,
    xunshou,
    zhifuStar,
    zhishiGate
  };
}

export function calculateMeihuaByDice(upperNum: number, lowerNum: number, changeLine: number): MeihuaResult {
  const baseUpper = TRIGRAMS[upperNum] || TRIGRAMS[1];
  const baseLower = TRIGRAMS[lowerNum] || TRIGRAMS[8];
  const baseName = getHexagramName(upperNum, lowerNum);

  const baseCombinedLines: boolean[] = [
    ...baseLower.lines, // indices 0, 1, 2
    ...baseUpper.lines  // indices 3, 4, 5
  ];

  // Mutual lower trigram lines = original lines [2, 3, 4] (indices 1, 2, 3)
  const mutualLowerLines: [boolean, boolean, boolean] = [
    baseCombinedLines[1],
    baseCombinedLines[2],
    baseCombinedLines[3]
  ];

  // Mutual upper trigram lines = original lines [3, 4, 5] (indices 2, 3, 4)
  const mutualUpperLines: [boolean, boolean, boolean] = [
    baseCombinedLines[2],
    baseCombinedLines[3],
    baseCombinedLines[4]
  ];

  const findTrigramByLines = (lines: [boolean, boolean, boolean]): TrigramInfo => {
    return Object.values(TRIGRAMS).find(
      t => t.lines[0] === lines[0] && t.lines[1] === lines[1] && t.lines[2] === lines[2]
    ) || TRIGRAMS[8];
  };

  const mutualUpper = findTrigramByLines(mutualUpperLines);
  const mutualLower = findTrigramByLines(mutualLowerLines);
  const mutualName = getHexagramName(mutualUpper.number, mutualLower.number);

  const changeCombinedLines = [...baseCombinedLines];
  // Invert the moving line (1-indexed from bottom)
  changeCombinedLines[changeLine - 1] = !changeCombinedLines[changeLine - 1];

  const changeLowerLines: [boolean, boolean, boolean] = [
    changeCombinedLines[0],
    changeCombinedLines[1],
    changeCombinedLines[2]
  ];

  const changeUpperLines: [boolean, boolean, boolean] = [
    changeCombinedLines[3],
    changeCombinedLines[4],
    changeCombinedLines[5]
  ];

  const changeUpper = findTrigramByLines(changeUpperLines);
  const changeLower = findTrigramByLines(changeLowerLines);
  const changeName = getHexagramName(changeUpper.number, changeLower.number);

  return {
    baseUpper,
    baseLower,
    baseName,
    mutualUpper,
    mutualLower,
    mutualName,
    changeUpper,
    changeLower,
    changeName,
    changeLine
  };
}

export function getCustomJieQi(yyyy: number, mm: number, dd: number): string {
  const c = [
    //1月,小寒、大寒
    [6.11, 5.4055],
    [20.84, 20.12],
    //2月，立春、雨水
    [4.6295, 3.87],
    [19.4599, 18.73],
    //3月，惊蛰、春分
    [6.3826, 5.63],
    [21.4155, 20.646],
    //4月，清明、谷雨
    [5.59, 4.81],
    [20.888, 20.1],
    //5月，立夏、小满
    [6.318, 5.52],
    [21.86, 21.04],
    //6月，芒种、夏至
    [6.5, 5.678],
    [22.2, 21.37],
    //7月，小暑、大暑
    [7.928, 7.108],
    [23.65, 22.83],
    //8月，立秋、处暑
    [28.35, 7.5],
    [23.95, 23.13],
    //9月，白露、秋分
    [8.44, 7.646],
    [23.822, 23.042],
    //10月，寒露、霜降
    [9.098, 8.318],
    [24.218, 23.438],
    //11月，立冬、小雪
    [8.218, 7.438],
    [23.08, 22.36],
    //12月，大雪、冬至
    [7.9, 7.18],
    [22.6, 21.94]
  ];

  const ajust = [
    //小寒
    [1982, 0, 1],
    [2019, 0, -1],
    //大寒
    [2000, 1, 1],
    [2082, 1, 1],
    //立春

    //雨水
    [2026, 3, -1],
    //惊蛰

    //春分
    [2084, 5, 1],
    //清明

    //谷雨

    //立夏
    [1911, 8, 1],
    //小满
    [2008, 9, 1],
    //芒种
    [1902, 10, 1],
    //夏至
    [1928, 11, 1],
    //小暑
    [1925, 12, 1],
    [2016, 12, 1],
    //大暑
    [1922, 13, 1],
    //立秋
    [2002, 14, 1],
    //处暑

    //白露
    [1927, 16, 1],
    //秋分
    [1942, 17, 1],
    //寒露

    //霜降
    [2089, 19, 1],
    //立冬
    [2089, 20, 1],
    //小雪
    [1978, 21, 1],
    //大雪
    [1954, 22, 1],
    //冬至
    [1918, 23, -1],
    [2021, 23, -1]
  ];

  const cn24Days = [
    "小寒", "大寒", "立春", "雨水",
    "惊蛰", "春分", "清明", "谷雨",
    "立夏", "小满", "芒种", "夏至",
    "小暑", "大暑", "立秋", "处暑",
    "白露", "秋分", "寒露", "霜降",
    "立冬", "小雪", "大雪", "冬至",
    "未知"
  ];

  let cidx = -1;
  if (yyyy > 2000) { // 2000年按照20世纪算
    cidx = 1;
  } else if (yyyy > 1900) {
    cidx = 0;
  } else {
    return cn24Days[24]; // 未知
  }

  // 按照月份，查出当前月两个节气交节日期
  const jqidx1 = (mm - 1) * 2;
  const jqidx2 = (mm - 1) * 2 + 1;

  const c1 = c[jqidx1][cidx];
  const c2 = c[jqidx2][cidx];

  const y = yyyy % 100;

  // 计算出这两个节气所在日期
  let d1 = 0;
  let d2 = 0;

  if (jqidx1 > 3) {
    d1 = Math.floor(y * 0.2422 + c1) - Math.floor(y / 4);
  } else {
    d1 = Math.floor(y * 0.2422 + c1) - Math.floor((y - 1) / 4);
  }

  if (jqidx2 > 3) {
    d2 = Math.floor(y * 0.2422 + c2) - Math.floor(y / 4);
  } else {
    d2 = Math.floor(y * 0.2422 + c2) - Math.floor((y - 1) / 4);
  }

  // 最后根据特殊情况表调整一下最终结果
  for (let i = 0; i < ajust.length; i++) {
    if (ajust[i][0] === yyyy && ajust[i][1] === jqidx1) {
      d1 += ajust[i][2];
    }
    if (ajust[i][0] === yyyy && ajust[i][1] === jqidx2) {
      d2 += ajust[i][2];
    }
  }

  // 最后确定当前是在哪个节气范围内
  if (dd < d1) {
    if (jqidx1 > 0) {
      return cn24Days[jqidx1 - 1];
    } else {
      return "冬至"; // 1月小寒之前为上一年的冬至
    }
  } else if (dd < d2) {
    return cn24Days[jqidx1];
  }

  return cn24Days[jqidx2];
}
