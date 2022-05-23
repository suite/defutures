import { PublicKey } from "@solana/web3.js";
import Whitelist from "../model/whitelist";

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
