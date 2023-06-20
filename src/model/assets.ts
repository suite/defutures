import mongoose from "mongoose";

const optionsSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    imageUrl: { type: String },
});

const assetsSchema = new mongoose.Schema({
    league: { type: String },
    options: { type: [optionsSchema], default: [] }
});

export default mongoose.model("assets", assetsSchema);