import { Keypair, PublicKey } from "@solana/web3.js";
import { ObjectId } from "mongodb";
import Whitelist from "../model/whitelist";
import { WagerWalletSchema } from "./types";
import WagerWallet from '../model/wagerWallet';
import { getKeypair } from "../queries/solana";
import { ServerError } from "./serverError";

export function isValidPubKey(pubKey: string): boolean {
    try {
        new PublicKey(pubKey);
        return true;
    } catch(err) {
        return false;
    }
}

export async function isWhitelisted(publicKey: string): Promise<boolean> {
    try {
        if(!isValidPubKey(publicKey)) return false;

        const result = await Whitelist.findOne({ publicKey });
        
        if(result) return true;

        return false;
    } catch(err) {
        return false;
    }
}

export async function getEscrowWallet(selectionId: ObjectId): Promise<Keypair> {
    const wallet: WagerWalletSchema | null = await WagerWallet.findOne({ selectionId });

    if(!wallet) throw new ServerError("Could not find wager wallet.");

    return await getKeypair(wallet.privateKey);    
}

export function getObjectId(id: string): ObjectId | null {
    try {
        return new ObjectId(id)
    } catch (err) {
        return null;
    }
}