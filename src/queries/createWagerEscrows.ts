import * as splToken from "@solana/spl-token";
import * as web3 from '@solana/web3.js';
import { ObjectId } from "mongodb";
import { WagerSchema } from "../misc/types";
import crypto from "crypto";
import WagerWallet from '../model/wagerWallet';
import Wager from '../model/wager';
import PickWallet from '../model/pickWallet'
import Pick from '../model/pick'
import { ALGORITHM, CONNECTION, FUND_KEYPAIR, KEY, LOGTAIL, SALT, TOKEN_MINT } from "../config/database";
import { getPickEscrowWallet, getWagerEscrowWallet } from "../misc/utils";
import pick from "../model/pick";
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
       const { newWallet, finalSecret } = await createWallet();

        await WagerWallet.create({
            selectionId,
            publicKey: newWallet.publicKey.toString(),
            privateKey: finalSecret,
        })

        await Wager.updateOne({ 'selections._id': selectionId }, { '$set': {
            'selections.$.publicKey': newWallet.publicKey.toString()
        }})

        // Ensures we can read in from database
        const createdKeyPair = await getWagerEscrowWallet(selectionId);
        
        LOGTAIL.info(`Created keypair for selection ${selectionId} ${createdKeyPair.publicKey.toString()}`);

        // Creates token account for mint
        let tokenAccount;
        for (let i = 0; i < 5; i++) {
            try {
                tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(CONNECTION, FUND_KEYPAIR, TOKEN_MINT, createdKeyPair.publicKey);
                if (tokenAccount) {
                    break; // exit loop if operation was successful
                }
            } catch (err) {
                LOGTAIL.error(`Attempt ${i+1} failed: ${err}`);
                await new Promise(res => setTimeout(res, 1000)); // wait for 1 second before next try
            }
        }

        if(!tokenAccount) throw 'Error creating token account after 5 attempts.'

        LOGTAIL.info(`Created wager escrow for selection ${selectionId}`)

        return newWallet.publicKey;
    } catch (err) {
        LOGTAIL.error(`Error creating wager escrow for selection ${selectionId} ${err}`)

        return null;
    }
}

export async function createPickEscrow(pickId: ObjectId): Promise<web3.PublicKey | null> {
    try {
        const { newWallet, finalSecret } = await createWallet();

        await PickWallet.create({
            pickId,
            publicKey: newWallet.publicKey.toString(),
            privateKey: finalSecret,
        })

        await Pick.findByIdAndUpdate(pickId, { '$set': {
            'publicKey': newWallet.publicKey.toString()
        }})

        // Ensures we can read in from database
        const createdKeyPair = await getPickEscrowWallet(pickId);
        
        LOGTAIL.info(`Created keypair for pick ${pickId} ${createdKeyPair.publicKey.toString()}`);
        
        // Creates token account for mint
        const tokenAccount = await splToken.getOrCreateAssociatedTokenAccount(CONNECTION, FUND_KEYPAIR, TOKEN_MINT, createdKeyPair.publicKey);

        if(!tokenAccount) throw 'Error creating token account.'

        LOGTAIL.info(`Created wager escrow for pick ${pickId}`)

        return newWallet.publicKey;        
    } catch (err) {
        LOGTAIL.error(`Error creating pick escrow for pick ${pickId} ${err}`)

        return null;
    } 
}

async function createWallet() {
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


    return {
        newWallet,
        finalSecret
    }
}

