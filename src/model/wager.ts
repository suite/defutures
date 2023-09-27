import mongoose from "mongoose";
import { userSchema } from "./user";

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
    nickname: { type: String, default: '' },
    winAmount: { type: Number, default: 0 },
    transferData: { type: transferData, default: { error: 0 } },
    user: { type: userSchema, default: null },
});

const wagerSelection = new mongoose.Schema({
    title: { type: String },
    record: { type: String },
    totalUsers: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    winner: { type: Boolean, default: false },  
    publicKey: { type: String, default: '' },
    imageUrl: { type: String },
    winnerImageUrl: { type: String },
    nftImageUrl: { type: String }
});

// TODO: maybe add createdby (pubkey) to keep track..
const wagerSchema = new mongoose.Schema({
    title: { type: String },
    description: { type: String },
    finalScore: { type: String, default: '' },
    status: {
        type: String,
        enum : ['upcoming', 'live', 'closed', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    league: { type: String },
    collectionName: { type: String },
    selections: { type: [wagerSelection] },
    startDate: { type: Number },
    endDate: { type: Number },
    gameDate: { type: Number },
    placedBets: { type: [placedBet], default: []},
    airdropProgress: { type: Boolean, default: false },
    metadata: { type: [], default: [] },
    creator: { type: userSchema }, 
    token: { type: String },
    isAdmin: { type: Boolean, default: false },
    info: {
        type: String,
        default: '',
        validate: {
          validator: function (v: string) {
            // This function checks if the length of 'v' is less than or equal to 250
            return v.length <= 250;
          },
          message: 'Info must not exceed 250 characters',
        },
    },
    /*
    ex: 
    metadata: [
        {  https://metadata.y00ts.com/y/2.json
            'y00t': {
                traits: [],
                ids: []
            }
        },
        { https://metadata.degods.com/g/990.json
            'de': {
                traits: [],
                ids: []
            }
        }, 
        {
            'custom_urls': [],
        },
        {
            'homepageNftOne': '', Make sure these work
            'homepageNftTwo': '',
        }
    */
});

export default mongoose.model("wager", wagerSchema);