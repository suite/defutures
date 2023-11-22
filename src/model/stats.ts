import mongoose from "mongoose";

const volume = new mongoose.Schema({
    token: { type: String },
    amount: { type: Number },
});

const stats = new mongoose.Schema({
    gamesHosted: { type: Number },
    uniquePlayers: { type: Number },
    totalPicks: { type: Number },
    totalVolume: { type: [volume], default: [] },
});

const statsSchema = new mongoose.Schema({
    live: { type: stats, default: {} },
    total: { type: stats, default: {} },
});

export default mongoose.model("stats", statsSchema);