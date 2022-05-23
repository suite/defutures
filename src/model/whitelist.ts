import mongoose from "mongoose";

const whitelistSchema = new mongoose.Schema({
    publicKey: { type: String },
});

export default mongoose.model("whitelist", whitelistSchema);