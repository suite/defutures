import { Keypair, PublicKey } from "@solana/web3.js"
import { ObjectId } from "mongodb"
import { ServerError } from "./serverError"

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
    transferData: WagerTransferData
}

export type WagerSchema = {
    _id: ObjectId,
    title: string,
    description: string,
    finalScore: string,
    status: 'upcoming' | 'live' | 'closed' | 'completed' | 'cancelled',
    league: 'football' | 'basketball' | 'baseball' | 'boxing' | 'soccer',
    selections: Array<WagerSelectionSchema>,
    startDate: number,
    endDate: number,
    gameDate: number,
    placedBets: Array<WagerBetSchema>,
    publicKey: string,
    airdropProgress: boolean
}

export type TokenBalanceResult = {
    amount: number,
    timestamp: Date | undefined,
    userPublicKey: string
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

export type SplTransferResult = {
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