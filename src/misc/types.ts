import { ObjectId } from "mongoose"
import { ServerError } from "./serverError"

export type WagerSelectionSchema = {
    _id: ObjectId,
    title: string,
    totalUsers: number,
    totalSpent: number,
    winner: boolean,
    publicKey: string,
}

export type WagerBetAmountSchema = {
    _id: ObjectId,
    amount: number,
    signature: string
}

export type WagerBetSchema = {
    _id: ObjectId,
    publicKey: string,
    amounts: Array<WagerBetAmountSchema>,
    selectionId: ObjectId,
    nickname: string,
    claimed: boolean
}

export type WagerSchema = {
    _id: ObjectId,
    title: string,
    status: 'upcoming' | 'live' | 'closed' | 'completed',
    selections: Array<WagerSelectionSchema>,
    startDate: number,
    endDate: number,
    gameDate: number,
    placedBets: Array<WagerBetSchema>,
    publicKey: string
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
    error?: ServerError | unknown
}