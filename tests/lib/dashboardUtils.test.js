import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeVelocityText } from '@/lib/dashboardUtils';

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
