import type { Category, CategorizeInput, ICategorizationService } from '../interfaces/index.js';

type RuleCategory = Exclude<Category, 'Прочее'>;

const KEYWORDS: Record<RuleCategory, string[]> = {
    'Node.js': ['node.js', 'nodejs', 'npm', 'v8'],
    Docker: ['docker', 'container', 'containerd'],
    AWS: ['aws', 'amazon web services', 'lambda', 'ec2'],
    DevOps: ['ci/cd', 'kubernetes', 'devops', 'pipeline'],
    AI: ['llm', 'ai agent', 'machine learning', 'gpt'],
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildKeywordPattern(keyword: string): RegExp {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i');
}

const RULES: { category: RuleCategory; patterns: RegExp[] }[] = (
    Object.entries(KEYWORDS) as [RuleCategory, string[]][]
).map(([category, keywords]) => ({
    category,
    patterns: keywords.map(buildKeywordPattern),
}));

export default class CategorizationService implements ICategorizationService {
    categorize({ title, content }: CategorizeInput): Category {
        const text = `${title} ${content}`;

        for (const { category, patterns } of RULES) {
            if (patterns.some((pattern) => pattern.test(text))) {
                return category;
            }
        }

        return 'Прочее';
    }
}
