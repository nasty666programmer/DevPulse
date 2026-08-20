import mongoose from 'mongoose';
import Logger from '../modules/logger/index.js';

export default class MongoDB {
    private readonly uri: string;

    constructor() {
        this.uri = process.env.MONGO_URI!;
    }

    async connect(): Promise<void> {
        try {
            await mongoose.connect(this.uri);

            Logger.info('MongoDB connected');
        } catch (error) {
            Logger.error('MongoDB connection failed', error);
            process.exit(1);
        }
    }

    async disconnect(): Promise<void> {
        await mongoose.disconnect();

        Logger.info('MongoDB disconnected');
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!mongoose.connection.db) {
                return false;
            }

            await mongoose.connection.db.admin().ping();

            Logger.info('Mongo healthCheck is success');

            return true;
        } catch (error) {
            Logger.error('MongoDB health check failed', error);
            return false;
        }
    }
}
