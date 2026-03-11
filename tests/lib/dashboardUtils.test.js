import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeVelocityText, buildHeatmapData, heatmapQuartiles, heatLevel, groupIntoWeeks, computeRhythmData, generateRhythmSummary } from '@/lib/dashboardUtils';

// Helper: generate chartWeeks with given completed values (8 weeks)
function makeChartWeeks(completedArr, createdArr) {
  return completedArr.map((c, i) => ({
    label: `W${i}`,
    completed: c,
    created: createdArr ? createdArr[i] : 0,
  }));
}

describe('computeVelocityText', () => {
  beforeEach(() => {
    // Fix Math.random for deterministic tests
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('データ不足時（有効な過去週が2未満）はnullを返す', () => {
    const chart = makeChartWeeks([0, 0, 0, 0, 0, 0, 0, 5]);
    const summary = { month: { completed: 5 }, today: { completed: 0 } };
    // priorWeeks all 0 → validPrior.length < 2
    expect(computeVelocityText(5, [0, 0, 0, 0], chart, summary)).toBeNull();
  });

  it('データ不足時（有効な過去週が1件のみ）はnullを返す', () => {
    const chart = makeChartWeeks([0, 0, 0, 3, 0, 0, 0, 5]);
    const summary = { month: { completed: 5 }, today: { completed: 0 } };
    expect(computeVelocityText(5, [3, 0, 0, 0], chart, summary)).toBeNull();
  });

  it('8週間で最高ペースの場合、特別メッセージを返す', () => {
    // Prior 7 weeks max is 5, current week is 6
    const chart = makeChartWeeks([2, 3, 5, 4, 3, 2, 4, 6]);
    const summary = { month: { completed: 10 }, today: { completed: 1 } };
    const result = computeVelocityText(6, [4, 3, 2, 4], chart, summary);
    expect(result).toBe('今週は8週間でいちばんのペースです');
  });

  it('8週間最高でも今週0件ならベスト判定しない', () => {
    const chart = makeChartWeeks([0, 0, 0, 0, 0, 0, 0, 0]);
    const summary = { month: { completed: 0 }, today: { completed: 0 } };
    // thisWeek=0 → 0 > maxEver(0) is false
    expect(computeVelocityText(0, [0, 0, 3, 2], chart, summary)).toBeNull();
  });

  it('3週連続好調時に専用メッセージを返す', () => {
    // priorWeeks [4, 6, 5, 3] → sorted [3,4,5,6] → median=(4+5)/2=4.5
    // chartWeeks[5]=5, [6]=6, [7]=5 → all >= 4.5 → 3週連続好調
    const chart = makeChartWeeks([4, 6, 5, 3, 4, 5, 6, 5]);
    const summary = { month: { completed: 20 }, today: { completed: 1 } };
    const result = computeVelocityText(5, [4, 6, 5, 3], chart, summary);
    expect(result).toBe('3週連続で調子がいいです');
  });

  it('今日3件以上完了で「今日の勢いがあります」を返す', () => {
    const chart = makeChartWeeks([5, 5, 5, 5, 5, 3, 5, 5]);
    const summary = { month: { completed: 10 }, today: { completed: 3 } };
    // thisWeek(5) is not > maxEver(5), so best-in-8 is skipped
    // chartWeeks[5]=3 < median(5) → 3週連続好調チェックも不成立
    const result = computeVelocityText(5, [5, 5, 5, 5], chart, summary);
    expect(result).toBe('今日の勢いがあります');
  });

  it('過去週の有効データが1件だけの場合nullを返す（中央値判定に到達しない）', () => {
    // priorWeeks [0, 0, 0, 2] → validPrior=[2] length=1 < 2 → null
    const chart = makeChartWeeks([0, 0, 0, 2, 0, 0, 0, 1]);
    const summary = { month: { completed: 3 }, today: { completed: 0 } };
    const result = computeVelocityText(1, [0, 0, 0, 2], chart, summary);
    expect(result).toBeNull();
  });

  it('過去週の有効データが2件でも中央値が低い場合は月実績を返す', () => {
    // priorWeeks [0, 0, 3, 2] → sorted [0, 0, 2, 3] → median = (0+2)/2=1
    // thisWeek=0 → ratio=0/1=0 → < 0.7 → 低ペース → 月実績あり
    const chart = makeChartWeeks([0, 0, 3, 2, 0, 0, 0, 0]);
    const summary = { month: { completed: 5 }, today: { completed: 0 } };
    const result = computeVelocityText(0, [0, 0, 3, 2], chart, summary);
    expect(result).toBe('今月は5件完了しています');
  });

  it('ratio >= 1.3（高ペース）で正のメッセージを返す', () => {
    // priorWeeks [4, 6, 5, 3] → sorted [3,4,5,6] → median=(4+5)/2=4.5
    // thisWeek=6 → ratio=6/4.5=1.33 → >= 1.3
    // chartWeeks[5]=3 < median(4.5) → 3週連続好調チェック不成立
    const chart = makeChartWeeks([4, 6, 5, 3, 4, 3, 5, 6]);
    const summary = { month: { completed: 20 }, today: { completed: 1 } };
    const result = computeVelocityText(6, [4, 6, 5, 3], chart, summary);
    expect(['いい流れです', '今週は調子が出ています', '勢いがあります']).toContain(result);
  });

  it('ratio >= 0.7（安定ペース）で安定メッセージを返す', () => {
    // priorWeeks [4, 6, 5, 3] → median=4.5
    // thisWeek=4 → ratio=4/4.5=0.89 → >= 0.7
    const chart = makeChartWeeks([4, 6, 5, 3, 4, 6, 5, 4]);
    const summary = { month: { completed: 20 }, today: { completed: 1 } };
    const result = computeVelocityText(4, [4, 6, 5, 3], chart, summary);
    expect(['安定したペースです', 'ちゃんと動けています']).toContain(result);
  });

  it('低ペースで月完了がある場合、月の実績メッセージを返す', () => {
    // priorWeeks [10, 8, 12, 9] → sorted [8,9,10,12] → median=(9+10)/2=9.5
    // thisWeek=2 → ratio=2/9.5=0.21 → < 0.7
    const chart = makeChartWeeks([10, 8, 12, 9, 10, 8, 12, 2]);
    const summary = { month: { completed: 15 }, today: { completed: 0 } };
    const result = computeVelocityText(2, [10, 8, 12, 9], chart, summary);
    expect(result).toBe('今月は15件完了しています');
  });

  it('低ペースで月完了もない場合nullを返す', () => {
    // priorWeeks [10, 8, 12, 9] → median=9.5
    // thisWeek=1 → ratio=1/9.5=0.105 → < 0.7
    const chart = makeChartWeeks([10, 8, 12, 9, 10, 8, 12, 1]);
    const summary = { month: { completed: 0 }, today: { completed: 0 } };
    const result = computeVelocityText(1, [10, 8, 12, 9], chart, summary);
    expect(result).toBeNull();
  });

  it('中央値の計算: 奇数個の配列', () => {
    // priorWeeks [3, 5, 7, 0] → sorted [0,3,5,7] → median=(3+5)/2=4
    // thisWeek=6 → ratio=6/4=1.5 → >= 1.3
    // chartWeeks[5]=3 < median(4) → 3週連続好調チェック不成立
    const chart = makeChartWeeks([3, 5, 7, 0, 3, 3, 7, 6]);
    const summary = { month: { completed: 20 }, today: { completed: 0 } };
    const result = computeVelocityText(6, [3, 5, 7, 0], chart, summary);
    expect(['いい流れです', '今週は調子が出ています', '勢いがあります']).toContain(result);
  });

  it('ベスト判定は過去7週のみ（現在週を除外）で比較する', () => {
    // chartWeeks[0..6] = prior weeks, chartWeeks[7] = current week
    // Prior 7 weeks max completed = 10, current week = 8
    // 8 is NOT > 10, so best-in-8 is NOT triggered
    const chart = makeChartWeeks([3, 10, 5, 4, 3, 2, 4, 8]);
    const summary = { month: { completed: 20 }, today: { completed: 0 } };
    // priorWeeks [4, 3, 2, 4] → sorted [2,3,4,4] → median=(3+4)/2=3.5
    // ratio=8/3.5=2.28 → >= 1.3 → high pace message
    const result = computeVelocityText(8, [4, 3, 2, 4], chart, summary);
    expect(['いい流れです', '今週は調子が出ています', '勢いがあります']).toContain(result);
  });
});

// ── buildHeatmapData ──────────────────────────────────────────────────────────

describe('buildHeatmapData', () => {
  // 2024-01-15 (月曜, dow=1) を固定日として使用
  const today = new Date(2024, 0, 15);
  const todayStr = today.toLocaleDateString('sv-SE'); // '2024-01-15'

  it('過去90日分（isFuture=false）を含む', () => {
    const { days } = buildHeatmapData({}, {}, today);
    const past = days.filter(d => !d.isFuture);
    expect(past).toHaveLength(90);
  });

  it('今日のセルに isToday: true が付く', () => {
    const { days } = buildHeatmapData({}, {}, today);
    const todayCell = days.find(d => d.dateStr === todayStr);
    expect(todayCell).toBeDefined();
    expect(todayCell.isToday).toBe(true);
    expect(todayCell.isFuture).toBe(false);
  });

  it('今日以外の過去セルは isToday: false', () => {
    const { days } = buildHeatmapData({}, {}, today);
    const others = days.filter(d => !d.isFuture && d.dateStr !== todayStr);
    expect(others.every(d => d.isToday === false)).toBe(true);
  });

  it('将来日のセルは isFuture: true', () => {
    const { days } = buildHeatmapData({}, {}, today);
    const future = days.filter(d => d.isFuture);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every(d => d.isFuture === true)).toBe(true);
  });

  it('total = completed + created', () => {
    const completedByDay = { [todayStr]: 3 };
    const createdByDay = { [todayStr]: 2 };
    const { days } = buildHeatmapData(completedByDay, createdByDay, today);
    const cell = days.find(d => d.dateStr === todayStr);
    expect(cell.total).toBe(5);
    expect(cell.completed).toBe(3);
  });

  it('データのない日は total=0, completed=0', () => {
    const { days } = buildHeatmapData({}, {}, today);
    const cell = days.find(d => d.dateStr === todayStr);
    expect(cell.total).toBe(0);
    expect(cell.completed).toBe(0);
  });

  it('activeDays は past days で total>0 の日数', () => {
    const completedByDay = { [todayStr]: 2, '2024-01-14': 5 };
    const { activeDays } = buildHeatmapData(completedByDay, {}, today);
    expect(activeDays).toBe(2);
  });

  it('将来日は activeDays に含まない', () => {
    const { activeDays } = buildHeatmapData({}, {}, today);
    expect(activeDays).toBe(0);
  });

  it('totalCompleted は past days の completed の合計', () => {
    const completedByDay = { [todayStr]: 3, '2024-01-14': 5 };
    const { totalCompleted } = buildHeatmapData(completedByDay, {}, today);
    expect(totalCompleted).toBe(8);
  });

  it('dow は正しい曜日番号（月曜=1）', () => {
    const { days } = buildHeatmapData({}, {}, today);
    const cell = days.find(d => d.dateStr === todayStr);
    expect(cell.dow).toBe(1);
  });

  it('将来日は日曜（dow=0）を含まない（groupIntoWeeks境界の手前で停止）', () => {
    const { days } = buildHeatmapData({}, {}, today);
    const future = days.filter(d => d.isFuture);
    expect(future.every(d => d.dow !== 0)).toBe(true);
  });

  it('水曜基準でも将来日に日曜（dow=0）が含まれない', () => {
    // 2024-01-17 = 水曜 → 将来日: 木(4), 金(5), 土(6) の3日で停止
    const wed = new Date(2024, 0, 17);
    const { days } = buildHeatmapData({}, {}, wed);
    const future = days.filter(d => d.isFuture);
    expect(future).toHaveLength(3);
    expect(future.map(d => d.dow)).toEqual([4, 5, 6]);
  });

  it('土曜基準では将来日が0件（翌日が日曜のため即break）', () => {
    // 2024-01-20 = 土曜 → i=1 で日曜(dow=0) → break → 将来日なし
    const sat = new Date(2024, 0, 20);
    const { days } = buildHeatmapData({}, {}, sat);
    const future = days.filter(d => d.isFuture);
    expect(future).toHaveLength(0);
  });

  it('日曜基準でも将来日に日曜が含まれない（ループ範囲内で次の日曜に到達しない）', () => {
    // 2024-01-21 = 日曜 → 将来日: 月(1)〜土(6) の6日
    const sun = new Date(2024, 0, 21);
    const { days } = buildHeatmapData({}, {}, sun);
    const future = days.filter(d => d.isFuture);
    expect(future).toHaveLength(6);
    expect(future.every(d => d.dow !== 0)).toBe(true);
  });

  it('groupIntoWeeksと組み合わせて末尾に孤立1セルカラムが生成されない', () => {
    // 水曜基準: 孤立日曜カラムが発生しないことを結合テストで検証
    const wed = new Date(2024, 0, 17);
    const { days } = buildHeatmapData({}, {}, wed);
    const weeks = groupIntoWeeks(days);
    // 末尾の週が1セルだけの孤立カラムでないこと
    const lastWeek = weeks[weeks.length - 1];
    expect(lastWeek.length).toBeGreaterThan(1);
  });
});

// ── heatmapQuartiles ──────────────────────────────────────────────────────────

describe('heatmapQuartiles', () => {
  it('活動日（total>0 の past days）が4未満なら [1, 3] を返す', () => {
    const days = [
      { total: 2, isFuture: false },
      { total: 0, isFuture: false },
      { total: 5, isFuture: false },
    ];
    expect(heatmapQuartiles(days)).toEqual([1, 3]);
  });

  it('活動日が4以上なら四分位値を算出する', () => {
    // nonZero sorted: [1, 2, 4, 8]
    // q1 = nonZero[floor(4*0.25)=1] = 2
    // q3 = nonZero[floor(4*0.75)=3] = 8
    const days = [
      { total: 4, isFuture: false },
      { total: 1, isFuture: false },
      { total: 8, isFuture: false },
      { total: 2, isFuture: false },
      { total: 0, isFuture: false },
    ];
    expect(heatmapQuartiles(days)).toEqual([2, 8]);
  });

  it('将来日は四分位計算から除外する', () => {
    const days = [
      { total: 100, isFuture: true },
      { total: 100, isFuture: true },
      { total: 100, isFuture: true },
      { total: 1, isFuture: false },
      { total: 3, isFuture: false },
    ];
    // past actives = 2件 < 4 → [1, 3]
    expect(heatmapQuartiles(days)).toEqual([1, 3]);
  });

  it('total=0 の日は四分位計算から除外する', () => {
    const days = Array.from({ length: 10 }, () => ({ total: 0, isFuture: false }));
    expect(heatmapQuartiles(days)).toEqual([1, 3]);
  });
});

// ── heatLevel ────────────────────────────────────────────────────────────────

describe('heatLevel', () => {
  it('value=0 → 0（無活動）', () => {
    expect(heatLevel(0, 2, 8)).toBe(0);
  });

  it('value <= q1 → 1（低）', () => {
    expect(heatLevel(1, 2, 8)).toBe(1);
    expect(heatLevel(2, 2, 8)).toBe(1); // q1 境界値
  });

  it('q1 < value <= q3 → 2（中）', () => {
    expect(heatLevel(3, 2, 8)).toBe(2);
    expect(heatLevel(8, 2, 8)).toBe(2); // q3 境界値
  });

  it('value > q3 → 3（高）', () => {
    expect(heatLevel(9, 2, 8)).toBe(3);
    expect(heatLevel(100, 2, 8)).toBe(3);
  });
});

// ── groupIntoWeeks ────────────────────────────────────────────────────────────

describe('groupIntoWeeks', () => {
  it('空配列は空配列を返す', () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });

  it('日曜（dow=0）で週を区切る', () => {
    // Mon〜Sat → Sun〜Mon の2週
    const days = [
      { dow: 1 }, { dow: 2 }, { dow: 3 }, { dow: 4 }, { dow: 5 }, { dow: 6 },
      { dow: 0 }, // Sunday → 新しい週へ
      { dow: 1 },
    ];
    const weeks = groupIntoWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(6); // Mon-Sat
    expect(weeks[1]).toHaveLength(2); // Sun-Mon
  });

  it('日曜始まりの完全週を正確に2週に分割する', () => {
    // Sun〜Sat (7日) → Sun〜Mon (3日) の2週
    const days = [
      { dow: 0 }, { dow: 1 }, { dow: 2 }, { dow: 3 }, { dow: 4 }, { dow: 5 }, { dow: 6 },
      { dow: 0 }, { dow: 1 }, { dow: 2 },
    ];
    const weeks = groupIntoWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(7);
    expect(weeks[1]).toHaveLength(3);
  });

  it('日曜が先頭にない場合は先頭から最初の日曜前が第1週', () => {
    const days = [{ dow: 3 }, { dow: 4 }, { dow: 0 }, { dow: 1 }];
    const weeks = groupIntoWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toHaveLength(2); // Wed, Thu
    expect(weeks[1]).toHaveLength(2); // Sun, Mon
  });
});

// ── computeRhythmData ──────────────────────────────────────────────────────────

describe('computeRhythmData', () => {
  it('7要素の配列を返し、各要素にday・rateプロパティがある', () => {
    const today = new Date(2024, 0, 15); // 月曜
    const result = computeRhythmData({}, {}, today);
    expect(result).toHaveLength(7);
    expect(result.map(r => r.day)).toEqual(['月', '火', '水', '木', '金', '土', '日']);
    result.forEach(r => {
      expect(r).toHaveProperty('rate');
      expect(typeof r.rate).toBe('number');
    });
  });

  it('活動データがない場合、全曜日のrateが0', () => {
    const today = new Date(2024, 0, 15);
    const result = computeRhythmData({}, {}, today);
    result.forEach(r => {
      expect(r.rate).toBe(0);
    });
  });

  it('特定の曜日に毎週活動がある場合、その曜日のrateが高くなる', () => {
    // 2024-01-15 = 月曜
    // 過去10週の月曜すべてに活動を入れる
    const today = new Date(2024, 0, 15);
    const completedByDay = {};
    for (let w = 0; w < 10; w++) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);
      completedByDay[d.toLocaleDateString('sv-SE')] = 3;
    }
    const result = computeRhythmData(completedByDay, {}, today);
    // 月曜 (index 0) のrateは1.0になるはず
    expect(result[0].rate).toBe(1.0);
    // 他の曜日は0
    for (let i = 1; i < 7; i++) {
      expect(result[i].rate).toBe(0);
    }
  });

  it('completed と created の両方がカウントされる', () => {
    const today = new Date(2024, 0, 15); // 月曜
    const completedByDay = {};
    const createdByDay = {};
    // 5週分は completed、残り5週分は created のみ
    for (let w = 0; w < 5; w++) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);
      completedByDay[d.toLocaleDateString('sv-SE')] = 1;
    }
    for (let w = 5; w < 10; w++) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);
      createdByDay[d.toLocaleDateString('sv-SE')] = 1;
    }
    const result = computeRhythmData(completedByDay, createdByDay, today);
    expect(result[0].rate).toBe(1.0); // 全10週で活動あり
  });

  it('将来日の活動はカウントされない', () => {
    // 2024-01-15 = 月曜、火曜以降は将来日扱い
    const today = new Date(2024, 0, 15);
    const completedByDay = { '2024-01-16': 5, '2024-01-17': 5 }; // 火曜・水曜
    const result = computeRhythmData(completedByDay, {}, today);
    // 火曜・水曜の将来日はカウントされない
    expect(result[1].rate).toBe(0); // 火
    expect(result[2].rate).toBe(0); // 水
  });

  it('日曜基準でも正しくmondayOffsetを計算する', () => {
    // 2024-01-21 = 日曜 (dow=0)
    const today = new Date(2024, 0, 21);
    // mondayOffset = -6 (日曜の場合)
    // currentWeekStart = 2024-01-15 (月曜)
    const completedByDay = { '2024-01-21': 1 }; // 日曜に活動
    const result = computeRhythmData(completedByDay, {}, today);
    expect(result[6].rate).toBeGreaterThan(0); // 日曜 (index 6)
  });

  it('rateはactiveWeeks/totalWeeksの比率で計算される', () => {
    // 2024-01-15 = 月曜、10週中5週のみ月曜に活動あり
    const today = new Date(2024, 0, 15);
    const completedByDay = {};
    for (let w = 0; w < 5; w++) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);
      completedByDay[d.toLocaleDateString('sv-SE')] = 1;
    }
    const result = computeRhythmData(completedByDay, {}, today);
    expect(result[0].rate).toBe(0.5); // 5/10 = 0.5
  });
});

// ── generateRhythmSummary ────────────────────────────────────────────────────

describe('generateRhythmSummary', () => {
  it('強い曜日がない場合（全rate < 0.5）はnullを返す', () => {
    const data = [
      { day: '月', rate: 0.3 },
      { day: '火', rate: 0.4 },
      { day: '水', rate: 0.2 },
      { day: '木', rate: 0.1 },
      { day: '金', rate: 0.0 },
      { day: '土', rate: 0.0 },
      { day: '日', rate: 0.0 },
    ];
    expect(generateRhythmSummary(data)).toBeNull();
  });

  it('全rateが0の場合はnullを返す', () => {
    const data = Array.from({ length: 7 }, (_, i) => ({
      day: ['月', '火', '水', '木', '金', '土', '日'][i],
      rate: 0,
    }));
    expect(generateRhythmSummary(data)).toBeNull();
  });

  it('1つの強い曜日がある場合、その曜日名を含む要約を返す', () => {
    const data = [
      { day: '月', rate: 0.8 },
      { day: '火', rate: 0.2 },
      { day: '水', rate: 0.1 },
      { day: '木', rate: 0.0 },
      { day: '金', rate: 0.3 },
      { day: '土', rate: 0.0 },
      { day: '日', rate: 0.0 },
    ];
    expect(generateRhythmSummary(data)).toBe('月に進みやすい傾向');
  });

  it('複数の強い曜日がある場合、rate降順でトップ3を「・」区切りで返す', () => {
    const data = [
      { day: '月', rate: 0.6 },
      { day: '火', rate: 0.9 },
      { day: '水', rate: 0.7 },
      { day: '木', rate: 0.2 },
      { day: '金', rate: 0.0 },
      { day: '土', rate: 0.0 },
      { day: '日', rate: 0.0 },
    ];
    expect(generateRhythmSummary(data)).toBe('火・水・月に進みやすい傾向');
  });

  it('4つ以上の強い曜日があっても上位3つのみ表示する', () => {
    const data = [
      { day: '月', rate: 0.5 },
      { day: '火', rate: 0.6 },
      { day: '水', rate: 0.7 },
      { day: '木', rate: 0.8 },
      { day: '金', rate: 0.3 },
      { day: '土', rate: 0.0 },
      { day: '日', rate: 0.0 },
    ];
    expect(generateRhythmSummary(data)).toBe('木・水・火に進みやすい傾向');
  });

  it('rate=0.5の境界値は強い曜日に含まれる', () => {
    const data = [
      { day: '月', rate: 0.5 },
      { day: '火', rate: 0.49 },
      { day: '水', rate: 0.0 },
      { day: '木', rate: 0.0 },
      { day: '金', rate: 0.0 },
      { day: '土', rate: 0.0 },
      { day: '日', rate: 0.0 },
    ];
    expect(generateRhythmSummary(data)).toBe('月に進みやすい傾向');
  });
});
