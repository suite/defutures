import * as splToken from "@solana/spl-token";
import * as web3 from '@solana/web3.js';
import { ObjectId } from "mongodb";
import { WagerSchema } from "../misc/types";
import crypto from "crypto";
import WagerWallet from '../model/wagerWallet';
import Wager from '../model/wager';
import { ALGORITHM, CONNECTION, FUND_KEYPAIR, KEY, SALT, TOKEN_MINT } from "../config/database";
const bip39 = require('bip39');

export default async function createWagerEscrows(wager: WagerSchema): Promise<boolean> {
    for(const selection of wager.selections) {
        const pubKey = await createWagerEscrow(selection._id);
        if(pubKey === null) return false;
    }
    
    return true;
}

// TODO: stress test 
async function createWagerEscrow(selectionId: ObjectId): Promise<web3.PublicKey | null> {
    try {
        const mnemonic = bip39.generateMnemonic();
        const mnemonicBuffer = await bip39.mnemonicToSeed(mnemonic);
        const mnemonicSeed = new Uint8Array(mnemonicBuffer.toJSON().data.slice(0,32))
        const newWallet = web3.Keypair.fromSeed(mnemonicSeed);

        const key = crypto.scryptSync(KEY, SALT, 24);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
        const text = mnemonic;
    
        const encrypted = cipher.update(text, "utf8", "hex");
        const finalSecret = [
            encrypted + cipher.final("hex"),
            Buffer.from(iv).toString("hex"),
          ].join("|"); 

        await WagerWallet.create({
            selectionId,
            publicKey: newWallet.publicKey.toString(),
            privateKey: finalSecret,
        })

        await Wager.updateOne({ 'selections._id': selectionId }, { '$set': {
            'selections.$.publicKey': newWallet.publicKey.toString()
        }})

        // Creates token account for mint
        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(CONNECTION, FUND_KEYPAIR, TOKEN_MINT, newWallet.publicKey);

        if(!tokenAccount) throw 'Error creating token account.'

        return newWallet.publicKey;
    } catch (err) {
        console.log(err)
        return null;
    }
}
