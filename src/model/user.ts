import mongoose from "mongoose";

const stats = new mongoose.Schema({
    totalWins: { type: Number, default: 0 },
    totalGamesCreated: { type: Number, default: 0 },
    totalGamesPlayed: { type: Number, default: 0 },
    totalGamesAirDropped: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    longestWinStreak: { type: Number, default: 0 },
});

const twitterData = new mongoose.Schema({
    id: { type: String },
    username: { type: String },
    displayName: { type: String },
    profileImage: { type: String },
});

export const userSchema = new mongoose.Schema({
    publicKey: { type: String },
    twitterData: { type: twitterData, default: null },
    roles: { type: [String], enum: ['ADMIN', 'CREATOR', 'DEFAULT'], default: ['DEFAULT', 'CREATOR'] },
    stats: { type: stats },
});

export default mongoose.model("user", userSchema);