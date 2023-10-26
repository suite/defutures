import mongoose from "mongoose";

const volume = new mongoose.Schema({
    token: { type: String },
    amount: { type: Number },
});

const statsSchema = new mongoose.Schema({
    gamesHosted: { type: Number },
    uniquePlayers: { type: Number },
    totalPicks: { type: Number },
    totalVolume: { type: [volume], default: [] },
});

export default mongoose.model("stats", statsSchema);