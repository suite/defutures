import mongoose from "mongoose";

const twitterData = new mongoose.Schema({
    id: { type: String },
    username: { type: String },
    displayName: { type: String },
    profileImage: { type: String },
});

const userSchema = new mongoose.Schema({
    publicKey: { type: String },
    twitterData: { type: twitterData, default: null },
});

export default mongoose.model("user", userSchema);