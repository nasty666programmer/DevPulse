export type Category = 'Node.js' | 'Docker' | 'AWS' | 'DevOps' | 'AI' | 'Прочее';

export interface CategorizeInput {
    title: string;
    content: string;
}

export interface ICategorizationService {
    categorize(input: CategorizeInput): Category;
}
