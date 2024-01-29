import mongoose from "mongoose";

const stats = new mongoose.Schema({
    totalWins: { type: Number, default: 0 },
    totalGamesCreated: { type: Number, default: 0 },
    totalGamesPlayed: { type: Number, default: 0 },
    totalGamesAirDropped: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    winStreak: { type: Number, default: 0 },
    longestWinStreak: { type: Number, default: 0 },
    hottestPool: { type: Number, default: 0 },
    craziestUpset: { type: Number, default: 0 },
});

const twitterData = new mongoose.Schema({
    id: { type: String },
    username: { type: String },
    displayName: { type: String },
    profileImage: { type: String },
});

const deidWallet = new mongoose.Schema({
    network: { type: String },
    address: { type: String }
});

const deidData = new mongoose.Schema({
    id: { type: String },
    username: { type: String, default: null },
    twitterHandle: { type: String, default: null },
    profileImage: { type: String, default: null },
    discordUsername: { type: String, default: null },
    wallets: { type: [deidWallet], default: null },
});

export const userSchema = new mongoose.Schema({
    publicKey: { type: String },
    twitterData: { type: twitterData, default: null },
    deidData: { type: deidData, default: null },
    roles: { type: [String], enum: ['ADMIN', 'CREATOR', 'DEFAULT'], default: ['DEFAULT', 'CREATOR'] },
    stats: { type: stats },
});

export default mongoose.model("user", userSchema);