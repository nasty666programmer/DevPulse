import mongoose from 'mongoose';

export default class MongoDB {
    private readonly uri: string;

    constructor() {
        this.uri = process.env.MONGO_URI!;
    }

    async connect(): Promise<void> {
        try {
            await mongoose.connect(this.uri);

            console.log('MongoDB connected');
        } catch (error) {
            console.error('MongoDB connection failed', error);
            process.exit(1);
        }
    }

    async disconnect(): Promise<void> {
        await mongoose.disconnect();

        console.log('MongoDB disconnected');
    }

    async healthCheck(): Promise<boolean> {
        try {
            if (!mongoose.connection.db) {
                return false;
            }

            await mongoose.connection.db.admin().ping();

            console.log('Mongo healthCheck is success');

            return true;
        } catch (error) {
            console.error('MongoDB health check failed', error);
            return false;
        }
    }
}
