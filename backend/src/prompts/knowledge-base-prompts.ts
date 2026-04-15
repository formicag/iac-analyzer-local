import { QuestionGroup } from '../shared/interfaces/analysis.interface';

export function buildKnowledgeBaseQuery(
  pillar: string,
  questionTitle: string,
  question: QuestionGroup,
  lensName?: string,
): string {
  const bestPracticesList = question.bestPractices
    .map((bp, i) => `${i + 1}. ${bp}`)
    .join('\n');

  return `For the AWS Well-Architected ${lensName || 'Framework'}, ${pillar} pillar, question "${questionTitle}":

Best Practices:
${bestPracticesList}

For each best practice, provide:
- Risk level (High/Medium/Low) if not followed
- Implementation guidance
- Common anti-patterns
- Technical Relevancy score (1-10) indicating how assessable this practice is from IaC/architecture artifacts`;
}
