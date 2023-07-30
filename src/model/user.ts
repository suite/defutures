import mongoose from "mongoose";

const twitterData = new mongoose.Schema({
    id: { type: String },
    username: { type: String },
    displayName: { type: String },
    profileImage: { type: String },
});

export const userSchema = new mongoose.Schema({
    publicKey: { type: String },
    twitterData: { type: twitterData, default: null },
    roles: { type: [String], enum: ['ADMIN', 'CREATOR', 'DEFAULT'], default: ['DEFAULT'] },
});

export default mongoose.model("user", userSchema);