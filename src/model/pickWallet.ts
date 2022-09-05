import mongoose from "mongoose";

const pickWalletSchema = new mongoose.Schema({
    pickId: { type: mongoose.Schema.Types.ObjectId },
    publicKey: { type: String },
    privateKey: { type: String }
});

export default mongoose.model("pickWallet", pickWalletSchema);