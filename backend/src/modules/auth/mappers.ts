import type { IUserDocument } from '../../db/models/user/interface/user.js';

export function toUserDto(user: IUserDocument) {
    return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        // Just the boolean, never the raw Telegram user id — the client only
        // needs to know whether to offer "link" or show "already linked."
        telegramLinked: user.telegramUserId != null,
    };
}
