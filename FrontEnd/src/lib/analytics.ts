import { CONFIDENCE_THRESHOLD, HIGH_VARIANCE_THRESHOLD } from "./constants";

export interface ScoreEntry {
  pct: number;
  studentName: string;
  confidence: number;
}

export interface DistributionBucket {
  range: string;
  count: number;
}

export interface CriterionBreakdown {
  name: string;
  avgScore: number;
  avgMax?: number;
  avgPct: number;
  variance: number;
  count: number;
}

export function computeDistribution(scores: number[]): DistributionBucket[] {
  const distribution: DistributionBucket[] = [
    { range: "0-20", count: 0 },
    { range: "21-40", count: 0 },
    { range: "41-60", count: 0 },
    { range: "61-80", count: 0 },
    { range: "81-100", count: 0 },
  ];
  for (const pct of scores) {
    if (pct <= 20) distribution[0].count++;
    else if (pct <= 40) distribution[1].count++;
    else if (pct <= 60) distribution[2].count++;
    else if (pct <= 80) distribution[3].count++;
    else distribution[4].count++;
  }
  return distribution;
}

export function computePercentiles(sortedScores: number[]) {
  const len = sortedScores.length;
  const p25 = len ? sortedScores[Math.floor(len * 0.25)] : 0;
  const median = len ? sortedScores[Math.floor(len * 0.5)] : 0;
  const p75 = len ? sortedScores[Math.floor(len * 0.75)] : 0;
  return { p25, median, p75 };
}

export function computeOutliers(sortedScores: number[]): number[] {
  const { p25, p75 } = computePercentiles(sortedScores);
  const iqr = p75 - p25;
  return sortedScores.filter((s) => s < p25 - 1.5 * iqr || s > p75 + 1.5 * iqr);
}

export function computeCriteriaBreakdown(
  evaluatedSubs: Array<{ evaluations?: Array<{ criteria_scores?: Array<{ score: number; criteria?: { name?: string; max_score?: number } }> }> }>,
): CriterionBreakdown[] {
  const criteriaMap: Record<string, { scores: number[]; maxScores: number[]; name: string }> = {};
  for (const s of evaluatedSubs) {
    const csArray = s.evaluations?.[0]?.criteria_scores;
    if (!csArray) continue;
    for (const cs of csArray) {
      const name = cs.criteria?.name || "Unknown";
      if (!criteriaMap[name]) criteriaMap[name] = { scores: [], maxScores: [], name };
      criteriaMap[name].scores.push(Number(cs.score));
      criteriaMap[name].maxScores.push(Number(cs.criteria?.max_score || 5));
    }
  }
  return Object.values(criteriaMap).map((c) => {
    const avgScore = c.scores.reduce((a, b) => a + b, 0) / c.scores.length;
    const avgMax = c.maxScores.reduce((a, b) => a + b, 0) / c.maxScores.length;
    const avgPct = Math.round((avgScore / avgMax) * 100);
    const variance =
      c.scores.length > 1
        ? Math.round((c.scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / c.scores.length) * 100) / 100
        : 0;
    return {
      name: c.name,
      avgScore: Math.round(avgScore * 100) / 100,
      avgMax: Math.round(avgMax * 100) / 100,
      avgPct,
      variance,
      count: c.scores.length,
    };
  });
}

export function computeConfidenceStats(confidences: number[]) {
  const valid = confidences.filter((c) => c > 0);
  const avg = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  const lowCount = valid.filter((c) => c < CONFIDENCE_THRESHOLD).length;
  const lowPct = valid.length ? Math.round((lowCount / valid.length) * 100) : 0;
  return { avg, lowCount, lowPct };
}

export function findUnstableCriteria(breakdown: CriterionBreakdown[]): CriterionBreakdown[] {
  return breakdown.filter((c) => c.variance > HIGH_VARIANCE_THRESHOLD).sort((a, b) => b.variance - a.variance);
}
