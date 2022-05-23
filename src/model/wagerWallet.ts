import mongoose from "mongoose";

const wagerWalletSchema = new mongoose.Schema({
    selectionId: { type: mongoose.Schema.Types.ObjectId },
    publicKey: { type: String },
    privateKey: { type: String }
});

export default mongoose.model("wagerWallet", wagerWalletSchema);