import { Keypair, PublicKey } from "@solana/web3.js";
import { ObjectId } from "mongodb";
import Whitelist from "../model/whitelist";
import { PickSelectionSchema, PickWalletSchema, WagerWalletSchema } from "./types";
import WagerWallet from '../model/wagerWallet';
import PickWallet from '../model/pickWallet'
import { getKeypair } from "../queries/solana";
import { ServerError } from "./serverError";
import axios, { Method } from "axios";
import { LOGTAIL, RAPID_API } from "../config/database";
import Pick from '../model/pick';

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

export async function getWagerEscrowWallet(selectionId: ObjectId): Promise<Keypair> {
    const wallet: WagerWalletSchema | null = await WagerWallet.findOne({ selectionId });

    if(!wallet) throw new ServerError("Could not find wager wallet.");

    return await getKeypair(wallet.privateKey);    
}

export async function getPickEscrowWallet(pickId: ObjectId): Promise<Keypair> {
    const wallet: PickWalletSchema | null = await PickWallet.findOne({ pickId });

    if(!wallet) throw new ServerError("Could not find pick wallet.");

    return await getKeypair(wallet.privateKey);
}


export function getObjectId(id: string): ObjectId | null {
    try {
        return new ObjectId(id)
    } catch (err) {
        return null;
    }
}

export async function getTeamWinner(selection: PickSelectionSchema): Promise<Array<ObjectId> | null> {
    try {
        if(!selection.matchId) return null;

        const options = {
            method: 'GET' as Method,
            url: `https://americanfootballapi.p.rapidapi.com/api/american-football/match/${selection.matchId}`,
            headers: {
              'X-RapidAPI-Key': RAPID_API,
              'X-RapidAPI-Host': 'americanfootballapi.p.rapidapi.com'
            }
        };

        const response: any = await axios(options);

        if(response['event']['winnerCode'] === null) return null;

        const winnerCode = parseInt(response['event']['winnerCode']);

        // 1, home 
        // 2, away
        // 3, tie

        // api, first is away, second is home

        // Home team won, second team
        if(winnerCode === 1) return [selection.teams[1]._id];
        
        // Away team won, first time
        if(winnerCode === 2) return [selection.teams[0]._id];

        // Ties, both "win"
        if(winnerCode === 3) {
            return selection.teams.map(team => team._id);
        }

        return null;
    } catch (err) {
        LOGTAIL.error(`Error finding team winner ${err}`);

        return null;
    }
}

export async function setSelectionTeamWinner(pickId: ObjectId, selectionId: ObjectId, teamIds: Array<ObjectId>) {
    try {

        for(const teamId of teamIds) {
            LOGTAIL.info(`Setting ${teamId} as winner`);
            
            await Pick.updateOne({ "_id": pickId }, {
                'selections.$[outer].teams.$[inner].winner': true,
            }, {
                "arrayFilters": [{ "outer._id": selectionId }, { "inner._id": teamId }]
            })
        }
        
    } catch (err) {
        LOGTAIL.error(`Error setting team winner ${err}`);

        return null;
    }
}