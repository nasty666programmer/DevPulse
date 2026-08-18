import { describe, it, expect } from 'vitest';
import CategorizationService from '../../../modules/categorization/services/index.js';

describe('CategorizationService', () => {
    const service = new CategorizationService();

    it('categorizes Node.js articles', () => {
        expect(
            service.categorize({ title: 'Node.js 26 released', content: 'New npm features and V8 updates' })
        ).toBe('Node.js');
    });

    it('categorizes Docker articles', () => {
        expect(
            service.categorize({ title: 'Docker Compose tips', content: 'Working with containers efficiently' })
        ).toBe('Docker');
    });

    it('categorizes AWS articles', () => {
        expect(
            service.categorize({ title: 'AWS Lambda cold starts', content: 'Optimizing EC2 and Lambda functions' })
        ).toBe('AWS');
    });

    it('categorizes DevOps articles', () => {
        expect(
            service.categorize({ title: 'Kubernetes basics', content: 'Setting up a CI/CD pipeline' })
        ).toBe('DevOps');
    });

    it('categorizes AI articles', () => {
        expect(
            service.categorize({ title: 'Building an AI agent', content: 'Using an LLM for function calling' })
        ).toBe('AI');
    });

    it('falls back to Прочее when nothing matches', () => {
        expect(
            service.categorize({ title: 'Weekly newsletter', content: 'General programming news roundup' })
        ).toBe('Прочее');
    });

    it('respects word boundaries and does not match substrings', () => {
        expect(
            service.categorize({ title: 'Flawsome framework', content: 'A totally unrelated library' })
        ).toBe('Прочее');
    });

    it('picks the first matching category in dictionary order when several keywords match', () => {
        expect(
            service.categorize({
                title: 'Node.js meets Docker',
                content: 'Running a Node.js app inside a Docker container',
            })
        ).toBe('Node.js');
    });
});
