import mongoose from "mongoose";

const optionsSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    imageUrl: { type: String },
});

const assetsSchema = new mongoose.Schema({
    league: { type: String },
    options: { type: [optionsSchema], default: [] },
    is_hidden: { type: Boolean, default: false },
});

export default mongoose.model("assets", assetsSchema);