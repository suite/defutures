import mongoose from "mongoose";

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

const betAmount = new mongoose.Schema({
    amount: { type: Number },
    signature: { type: String },
});

// pickTeam
const pickTeam = new mongoose.Schema({
    name: { type: String },
    record: { type: String },
    imageUrl: { type: String },
    winner: { type: Boolean, default: false },
    finalScore: { type: Number }
});

// placedBet
const placedBet = new mongoose.Schema({
    publicKey: { type: String },
    pickedTeams: { type: [ mongoose.Schema.Types.ObjectId ] },
    tieBreaker: { type: Number, default: 0 },
    tieBreakerPoints: { type: Number, default: 0 },
    nickname: { type: String, default: '' },
    winAmount: { type: Number, default: 0 },
    amounts: { type: [betAmount], default: [] },
    transferData: { type: transferData, default: { error: 0 } },
    points: { type: Number, default: 0},
    wagerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'WagerUser' }
});

// pickSelection
const pickSelection = new mongoose.Schema({
    teams: { type: [pickTeam] }, // The two teams in the selection
    gameDate: { type: Number },
    totalScore: { type: Number },
    isTiebreaker: { type: Boolean },
    matchId: { type: Number, default: -1},
    title: { type: String },
    name: { type: String },
});

const pickSchema = new mongoose.Schema({
    title: { type: String },
    description: { type: String },
    publicKey: { type: String, default: '' },
    entryFee: { type: Number },
    totalUsers: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    status: {
        type: String,
        enum : ['upcoming', 'live', 'closed', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    startDate: { type: Number },
    endDate: { type: Number },
    airdropProgress: { type: Boolean, default: false },
    selections: { type: [pickSelection] },
    placedBets: { type: [placedBet], default: [] }
});

export default mongoose.model("pick", pickSchema);