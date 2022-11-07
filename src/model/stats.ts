import mongoose from "mongoose";

const statsSchema = new mongoose.Schema({
    gamesHosted: { type: Number },
    uniquePlayers: { type: Number },
    totalVolume: { type: Number },
});

export default mongoose.model("stats", statsSchema);