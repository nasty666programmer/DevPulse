import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../../../modules/config/index.js', () => ({
    default: { sessionMaxAgeMs: 1000 * 60 * 60 },
}));

import AuthService from '../../../modules/auth/services/index.js';
import { InvalidGoogleTokenError } from '../../../modules/auth/errors.js';
import type { IGoogleAuthProvider } from '../../../providers/google/interface/googleAuthProvider.js';
import type { IUserRepository } from '../../../db/repositories/user/interface/userRepository.js';
import type { ITokenRepository } from '../../../db/repositories/token/interface/tokenRepository.js';

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
        findByTelegramUserId: Mock<IUserRepository['findByTelegramUserId']>;
        setTelegramUserId: Mock<IUserRepository['setTelegramUserId']>;
    };
    let tokenRepository: {
        create: Mock<ITokenRepository['create']>;
        findByToken: Mock<ITokenRepository['findByToken']>;
        deleteByToken: Mock<ITokenRepository['deleteByToken']>;
    };
    let service: AuthService;

    beforeEach(() => {
        vi.clearAllMocks();
        googleAuthProvider = { verifyIdToken: vi.fn() };
        userRepository = {
            upsertFromGoogle: vi.fn(),
            findById: vi.fn(),
            findByTelegramUserId: vi.fn(),
            setTelegramUserId: vi.fn(),
        };
        tokenRepository = { create: vi.fn(), findByToken: vi.fn(), deleteByToken: vi.fn() };
        service = new AuthService({ googleAuthProvider, userRepository, tokenRepository });
    });

    it('upserts the Google profile and persists a fresh token row for the user', async () => {
        googleAuthProvider.verifyIdToken.mockResolvedValue({
            googleId: 'google-123',
            email: 'dev@example.com',
            name: 'Dev User',
            avatarUrl: null,
        });
        const stored = storedUser();
        userRepository.upsertFromGoogle.mockResolvedValue(stored);
        tokenRepository.create.mockImplementation(async (data) => ({ _id: new Types.ObjectId(), ...data }));

        const result = await service.signInWithGoogle('valid-id-token');

        expect(userRepository.upsertFromGoogle).toHaveBeenCalledWith({
            googleId: 'google-123',
            email: 'dev@example.com',
            name: 'Dev User',
            avatarUrl: null,
        });
        expect(result.user).toBe(stored);
        expect(tokenRepository.create).toHaveBeenCalledTimes(1);
        const createArgs = tokenRepository.create.mock.calls[0][0];
        expect(createArgs.token).toBe(result.sessionToken);
        expect(createArgs.userId).toBe(stored._id);
        expect(createArgs.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('throws InvalidGoogleTokenError and never touches the user repository when the token fails verification', async () => {
        googleAuthProvider.verifyIdToken.mockResolvedValue(null);

        await expect(service.signInWithGoogle('bad-token')).rejects.toBeInstanceOf(
            InvalidGoogleTokenError
        );
        expect(userRepository.upsertFromGoogle).not.toHaveBeenCalled();
        expect(tokenRepository.create).not.toHaveBeenCalled();
    });
});

describe('AuthService.verifySession', () => {
    let googleAuthProvider: { verifyIdToken: Mock<IGoogleAuthProvider['verifyIdToken']> };
    let userRepository: {
        upsertFromGoogle: Mock<IUserRepository['upsertFromGoogle']>;
        findById: Mock<IUserRepository['findById']>;
        findByTelegramUserId: Mock<IUserRepository['findByTelegramUserId']>;
        setTelegramUserId: Mock<IUserRepository['setTelegramUserId']>;
    };
    let tokenRepository: {
        create: Mock<ITokenRepository['create']>;
        findByToken: Mock<ITokenRepository['findByToken']>;
        deleteByToken: Mock<ITokenRepository['deleteByToken']>;
    };
    let service: AuthService;

    beforeEach(() => {
        vi.clearAllMocks();
        googleAuthProvider = { verifyIdToken: vi.fn() };
        userRepository = {
            upsertFromGoogle: vi.fn(),
            findById: vi.fn(),
            findByTelegramUserId: vi.fn(),
            setTelegramUserId: vi.fn(),
        };
        tokenRepository = { create: vi.fn(), findByToken: vi.fn(), deleteByToken: vi.fn() };
        service = new AuthService({ googleAuthProvider, userRepository, tokenRepository });
    });

    it('resolves the user for a token that exists and has not expired', async () => {
        const stored = storedUser();
        userRepository.findById.mockResolvedValue(stored);
        tokenRepository.findByToken.mockResolvedValue({
            _id: new Types.ObjectId(),
            token: 'a-valid-token',
            userId: stored._id,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
        });

        const user = await service.verifySession('a-valid-token');

        expect(userRepository.findById).toHaveBeenCalledWith(stored._id.toString());
        expect(user).toBe(stored);
    });

    it('returns null when no token row matches', async () => {
        tokenRepository.findByToken.mockResolvedValue(null);

        const user = await service.verifySession('unknown-token');

        expect(user).toBeNull();
        expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('returns null when the token row has expired', async () => {
        tokenRepository.findByToken.mockResolvedValue({
            _id: new Types.ObjectId(),
            token: 'expired-token',
            userId: new Types.ObjectId(),
            expiresAt: new Date(Date.now() - 1000),
            createdAt: new Date(),
        });

        const user = await service.verifySession('expired-token');

        expect(user).toBeNull();
        expect(userRepository.findById).not.toHaveBeenCalled();
    });

    it('returns null when the token is valid but the user no longer exists', async () => {
        userRepository.findById.mockResolvedValue(null);
        tokenRepository.findByToken.mockResolvedValue({
            _id: new Types.ObjectId(),
            token: 'a-valid-token',
            userId: new Types.ObjectId(),
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
        });

        const user = await service.verifySession('a-valid-token');

        expect(user).toBeNull();
    });
});

describe('AuthService.logout', () => {
    it('deletes the token row for the given session token', async () => {
        const googleAuthProvider = { verifyIdToken: vi.fn() };
        const userRepository = {
            upsertFromGoogle: vi.fn(),
            findById: vi.fn(),
            findByTelegramUserId: vi.fn(),
            setTelegramUserId: vi.fn(),
        };
        const tokenRepository = { create: vi.fn(), findByToken: vi.fn(), deleteByToken: vi.fn() };
        const service = new AuthService({ googleAuthProvider, userRepository, tokenRepository });

        await service.logout('some-token');

        expect(tokenRepository.deleteByToken).toHaveBeenCalledWith('some-token');
    });
});
