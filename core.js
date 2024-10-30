const mongoUri = 'mongodb://localhost:27017';
const dbName = 'mydatabase';
import { MongoClient, GridFSBucket } from 'mongodb';

async function initMongo() {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    gridFSBucket = new GridFSBucket(db, { bucketName: 'videos' });
    console.log('Connected to MongoDB');
}

export { initMongo };