import mongoose from "mongoose";

// Look into mongoose required types?

const betAmount = new mongoose.Schema({
    amount: { type: Number },
    signature: { type: String },
});

const transferData = new mongoose.Schema({
    amount: { type: Number },
    signature: { type: String },
    error: { type: Number, default: 0 },
    // error code 
    // -1 = success
    // 0 = not set
    // 1 = confirm err
    // 2 = general err
});

const placedBet = new mongoose.Schema({
    publicKey: { type: String },
    amounts: { type: [betAmount], default: [] },
    selectionId: { type: mongoose.Schema.Types.ObjectId },
    nickname: { type: String, default: "" },
    winAmount: { type: Number, default: 0 },
    transferData: { type: transferData, default: { error: 0 } }
});

const wagerSelection = new mongoose.Schema({
    title: { type: String },
    totalUsers: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    winner: { type: Boolean, default: false },  
    publicKey: { type: String, default: '' }
});

// TODO: maybe add createdby (pubkey) to keep track..
const wagerSchema = new mongoose.Schema({
    title: { type: String },
    status: {
        type: String,
        enum : ['upcoming', 'live', 'closed', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    selections: { type: [wagerSelection] },
    startDate: { type: Number },
    endDate: { type: Number },
    gameDate: { type: Number },
    placedBets: { type: [placedBet], default: []},
    airdropProgress: { type: Boolean, default: false }
});

export default mongoose.model("wager", wagerSchema);