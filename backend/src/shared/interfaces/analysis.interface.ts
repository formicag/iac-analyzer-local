export interface AnalysisResult {
  pillar: string;
  question: string;
  questionId: string;
  bestPractices: BestPractice[];
}

export interface BestPractice {
  id: string;
  name: string;
  relevant: boolean;
  applied: boolean;
  reasonApplied?: string;
  reasonNotApplied?: string;
  recommendations?: string;
}

export interface RiskSummary {
  pillarName: string;
  totalQuestions: number;
  answeredQuestions: number;
  highRisks: number;
  mediumRisks: number;
}

export interface QuestionGroup {
  pillar: string;
  title: string;
  questionId: string;
  bestPractices: string[];
  bestPracticeIds: string[];
}
