import { Keypair, PublicKey } from "@solana/web3.js"
import { ObjectId } from "mongodb"
import { ServerError } from "./serverError"

export type WagerSelectionSchema = {
    _id: ObjectId,
    title: string,
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
    status: 'upcoming' | 'live' | 'closed' | 'completed' | 'cancelled',
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