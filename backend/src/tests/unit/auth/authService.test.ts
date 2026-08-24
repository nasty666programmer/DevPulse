import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';

vi.mock('../../../modules/config/index.js', () => ({
    default: { sessionSecret: 'test-secret', sessionMaxAgeMs: 1000 * 60 * 60 },
}));

import AuthService from '../../../modules/auth/services/index.js';
import { InvalidGoogleTokenError } from '../../../modules/auth/errors.js';
import type { IGoogleAuthProvider } from '../../../providers/google/interface/googleAuthProvider.js';
import type { IUserRepository } from '../../../db/repositories/user/interface/userRepository.js';

function storedUser(overrides: Partial<{ email: string; name: string }> = {}) {
    return {
        _id: new Types.ObjectId(),
        googleId: 'google-123',
        email: 'dev@example.com',
        name: 'Dev User',
        avatarUrl: null,
        createdAt: new Date('2026-01-01'),
        lastLoginAt: new Date('2026-01-01'),
        ...overrides,
    };
}

describe('AuthService.signInWithGoogle', () => {
    let googleAuthProvider: { verifyIdToken: Mock<IGoogleAuthProvider['verifyIdToken']> };
    let userRepository: {
        upsertFromGoogle: Mock<IUserRepository['upsertFromGoogle']>;
        findById: Mock<IUserRepository['findById']>;
    };
    let service: AuthService;

    beforeEach(() => {
        vi.clearAllMocks();
        googleAuthProvider = { verifyIdToken: vi.fn() };
        userRepository = { upsertFromGoogle: vi.fn(), findById: vi.fn() };
        service = new AuthService({ googleAuthProvider, userRepository });
    });

    it('upserts the Google profile and returns a session token signed with the user id', async () => {
        googleAuthProvider.verifyIdToken.mockResolvedValue({
            googleId: 'google-123',
            email: 'dev@example.com',
            name: 'Dev User',
            avatarUrl: null,
        });
        const stored = storedUser();
        userRepository.upsertFromGoogle.mockResolvedValue(stored);

        const result = await service.signInWithGoogle('valid-id-token');

        expect(userRepository.upsertFromGoogle).toHaveBeenCalledWith({
            googleId: 'google-123',
            email: 'dev@example.com',
            name: 'Dev User',
            avatarUrl: null,
        });
        expect(result.user).toBe(stored);
        const decoded = jwt.verify(result.sessionToken, 'test-secret') as { sub: string };
        expect(decoded.sub).toBe(stored._id.toString());
    });

    it('throws InvalidGoogleTokenError and never touches the user repository when the token fails verification', async () => {
        googleAuthProvider.verifyIdToken.mockResolvedValue(null);

        await expect(service.signInWithGoogle('bad-token')).rejects.toBeInstanceOf(
            InvalidGoogleTokenError
        );
        expect(userRepository.upsertFromGoogle).not.toHaveBeenCalled();
    });
});

describe('AuthService.verifySession', () => {
    let googleAuthProvider: { verifyIdToken: Mock<IGoogleAuthProvider['verifyIdToken']> };
    let userRepository: {
        upsertFromGoogle: Mock<IUserRepository['upsertFromGoogle']>;
        findById: Mock<IUserRepository['findById']>;
    };
    let service: AuthService;

    beforeEach(() => {
        vi.clearAllMocks();
        googleAuthProvider = { verifyIdToken: vi.fn() };
        userRepository = { upsertFromGoogle: vi.fn(), findById: vi.fn() };
        service = new AuthService({ googleAuthProvider, userRepository });
    });

    it('resolves the user for a session token signed with the current secret', async () => {
        const stored = storedUser();
        userRepository.findById.mockResolvedValue(stored);
        const token = jwt.sign({ sub: stored._id.toString() }, 'test-secret');

        const user = await service.verifySession(token);

        expect(userRepository.findById).toHaveBeenCalledWith(stored._id.toString());
        expect(user).toBe(stored);
    });

    it('returns null for a token signed with a different secret', async () => {
        const token = jwt.sign({ sub: 'someone' }, 'wrong-secret');

        const user = await service.verifySession(token);

        expect(user).toBeNull();
        expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('returns null when the token is valid but the user no longer exists', async () => {
        userRepository.findById.mockResolvedValue(null);
        const token = jwt.sign({ sub: 'deleted-user-id' }, 'test-secret');

        const user = await service.verifySession(token);

        expect(user).toBeNull();
    });
});
