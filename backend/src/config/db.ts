import mongoose from "mongoose";
import { env } from "./env";

let cachedConnection: typeof mongoose | null = null;


export async function connectDB() {
  try {
    if(cachedConnection) return cachedConnection;
     
    const dbUrl = env.MONGO_URI;
    if(!dbUrl) throw new Error("MongoDB environment variable is not set")

    cachedConnection = await mongoose.connect(dbUrl, {
      dbName : env.MONGO_DB_NAME
    })
    console.log(`MongoDB connected: ${mongoose.connection.name}`);
    return cachedConnection;
  } catch (error: any) {
    console.log("MongoDB error: ", error)
  }
}
