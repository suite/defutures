import mongoose from "mongoose";

const blacklistSchema = new mongoose.Schema({
    publicKey: { type: String, default: '' },
    twitterId: { type: String, default: '' },
});

export default mongoose.model("blacklist", blacklistSchema);