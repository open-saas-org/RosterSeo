// Classifies a keyword idea as question-format without a separate
// DataForSEO call - one real keyword_ideas fetch serves both the "Ideas"
// and "Questions" views via this client-side split.
const QUESTION_STARTER = /^(how|what|why|when|where|who|which|can|does|do|is|are|will|should)\b/i;

export function isQuestionKeyword(keyword: string): boolean {
  return QUESTION_STARTER.test(keyword.trim());
}
