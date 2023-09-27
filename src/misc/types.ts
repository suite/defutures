import { Keypair, PublicKey } from "@solana/web3.js"
import { ObjectId } from "mongodb"
import { USE_DEV } from "../config/database";

export type SplToken = 'DUST' | "USDC";
export type Token = 'SOL' | SplToken;

export type TokenDetails = {
    publicKey: PublicKey;
    decimals: number;
};

export type WagerSelectionSchema = {
    _id: ObjectId,
    title: string,
    record: string,
    totalUsers: number,
    totalSpent: number,
    winner: boolean,
    publicKey: string,
    imageUrl: string,
    winnerImageUrl: string,
    nftImageUrl: string
}

export type WagerBetAmountSchema = {
    _id: ObjectId,
    amount: number,
    signature: string
}

export type WagerTransferData = {
    _id: ObjectId,
    amount: number,
    signature: string,
    error: number
}

export type WagerBetSchema = {
    _id: ObjectId,
    publicKey: string,
    amounts: Array<WagerBetAmountSchema>,
    selectionId: ObjectId,
    nickname: string,
    winAmount: number,
    transferData: WagerTransferData,
    user: WagerUser
}

export type WagerSchema = {
    _id: ObjectId,
    title: string,
    description: string,
    finalScore: string,
    status: 'upcoming' | 'live' | 'closed' | 'completed' | 'cancelled',
    league: string,
    collectionName: string,
    selections: Array<WagerSelectionSchema>,
    startDate: number,
    endDate: number,
    gameDate: number,
    placedBets: Array<WagerBetSchema>,
    publicKey: string,
    airdropProgress: boolean,
    metadata: Array<any>,
    creator: WagerUser,
    token: Token,
    isAdmin: boolean,
    info: string
}

export type TokenBalanceResult = {
    amount: number,
    timestamp: Date | undefined,
    userPublicKey: string,
    token: Token
}

export type WagerWalletSchema = {
    _id: ObjectId,
    selectionId: ObjectId,
    publicKey: string,
    privateKey: string
}

export type PickWalletSchema = {
    _id: ObjectId,
    pickId: ObjectId,
    publicKey: string,
    privateKey: string
}

export type TokenTransferResult = {
    signature?: string,
    error?: number
}

export type AirdropAmount = {
    amount: number,
    toPubkey: PublicKey,
    fromKeypair: Keypair,
    selectionId: ObjectId
}

export type PickTeam = {
    _id: ObjectId,
    name: string,
    record: string,
    imageUrl: string,
    winner: boolean,
    finalScore: number,
    totalScore?: number
}

export type PickBetSchema = {
    _id: ObjectId,
    publicKey: string,
    pickedTeams: Array<ObjectId>,
    tieBreaker: number,
    tieBreakerPoints: number,
    nickname: string,
    winAmount: number,
    amounts: Array<WagerBetAmountSchema>,
    transferData: WagerTransferData,
    points: number
}

export type PickSelectionSchema = {
    _id: ObjectId,
    teams: Array<PickTeam>, // The two teams in the selection
    gameDate: number,
    totalScore: number,
    isTiebreaker: boolean,
    matchId?: number
}

export type PickSchema = {
    _id: ObjectId,
    title: string,
    description: string,
    publicKey: string,
    entryFee: number,
    totalUsers: number,
    totalSpent: number,
    status: 'upcoming' | 'live' | 'closed' | 'completed' | 'cancelled',
    startDate: number,
    endDate: number,
    airdropProgress: boolean,
    selections: Array<PickSelectionSchema>,
    placedBets: Array<PickBetSchema>
}

export type StatsSchema = {
    _id: ObjectId,
    gameHosted: number,
    uniquePlayers: number,
    totalVolume: number,
}

export type TwitterData = {
    id: string;
    username: string;
    displayName: string;
    profileImage: string;
}

type Roles = Role[];
type Role = 'ADMIN' | 'CREATOR' | 'DEFAULT';

export type WagerUser = {
    publicKey: string;
    twitterData: TwitterData | null;
    roles: Roles;
}

export type TeamOption = {
    _id: string;
    name: string;
    imageUrl: string;
  };
  
  export type League = {
    _id: string;
    league: string;
    options: TeamOption[];
    __v: number;
  };
  
  export type LeaguesArray = League[];

export enum TweetType {
    GAME_CREATION,
    GAME_PICK,
    GAME_WINNERS
}