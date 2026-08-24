import type { IUserDocument } from '../../db/models/user/interface/user.js';

export function toUserDto(user: IUserDocument) {
    return {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
    };
}
