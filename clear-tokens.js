import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DeviceToken from './models/DeviceToken.js';

dotenv.config();

async function clearTokens() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const result = await DeviceToken.deleteMany({});
    console.log(`Deleted ${result.deletedCount} old tokens from the database.`);
    
    mongoose.disconnect();
    console.log('Done.');
  } catch (error) {
    console.error(error);
  }
}

clearTokens();
