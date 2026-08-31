const mongoose = require('mongoose');

let mongodInstance = null;

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  // 1. Remote URI provided
  if (uri && (uri.startsWith('mongodb+srv://') || (!uri.includes('127.0.0.1') && !uri.includes('localhost')))) {
    try {
      console.log(`Connecting to remote MongoDB: ${uri.replace(/\/\/.*@/, '//***@')}`);
      const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      console.warn(`Failed connecting to remote MONGODB_URI: ${err.message}`);
    }
  }

  // 2. Local MongoDB
  const localUri = uri || 'mongodb://127.0.0.1:27017/educonnect';
  try {
    const conn = await mongoose.connect(localUri, { serverSelectionTimeoutMS: 1500 });
    console.log(`MongoDB Connected locally: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.log('Local MongoDB daemon not running. Initializing in-memory MongoDB instance...');
  }

  // 3. Fallback to in-memory MongoDB
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongodInstance = await MongoMemoryServer.create();
    const memoryUri = mongodInstance.getUri();
    const conn = await mongoose.connect(memoryUri);
    console.log(`In-Memory MongoDB initialized: ${memoryUri}`);
    return conn;
  } catch (memErr) {
    console.error('Failed to initialize in-memory MongoDB:', memErr.message);
    throw memErr;
  }
}

async function closeDB() {
  await mongoose.disconnect();
  if (mongodInstance) {
    await mongodInstance.stop();
  }
}

module.exports = {
  connectDB,
  closeDB
};
