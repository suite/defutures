// wagerId
// completed -> send winnings
// cancelled -> send back deposits

import { Keypair, PublicKey } from "@solana/web3.js";
import { ObjectId } from "mongodb";
import { ServerError } from "../misc/serverError";
import { AirdropAmount, WagerSchema, WagerWalletSchema } from "../misc/types";
import { getEscrowWallet } from "../misc/utils";
import Wager from '../model/wager';
import WagerWallet from '../model/wagerWallet';
import { transferSplToken } from "./solana";
import AsyncLock from 'async-lock';
import { LOGTAIL } from "../config/database";

const lock = new AsyncLock();

export default async function airdrop(wagerId: ObjectId) {
    lock.acquire("airdrop", async (done) => {
        try {
            const airdropStatus = await getAirdropProgress(wagerId);
            if(airdropStatus) return;

            await setAirdropProgress(wagerId, true);

            const wager: WagerSchema | null = await Wager.findById(wagerId);
            if(!wager) throw new ServerError('Could not find wager.');

            const airdropAmounts = await getAirdropAmounts(wager);
            if(!airdropAmounts) throw new ServerError('Could not get airdrop amounts.');

            for(const { amount, toPubkey, fromKeypair, selectionId } of airdropAmounts) {
                LOGTAIL.info(`Airdropping ${amount} to ${toPubkey.toString()}.`);

                const { signature, error } = await transferSplToken(fromKeypair, toPubkey, amount);

                LOGTAIL.info(`Result: sig: ${signature} Err: ${error}`);

                const placedBetsFilter = {
                    placedBets: {
                        $elemMatch: {
                            selectionId,
                            publicKey: toPubkey.toString()
                        }
                    }
                }

                await Wager.updateOne(placedBetsFilter, { 
                    'placedBets.$.transferData': {
                        amount,
                        signature,
                        error
                    } 
                });
            }

            LOGTAIL.info(`Completed airdrops for wager ${wagerId}`);

            done();
        } catch (err) {
            LOGTAIL.error(`Error airdropping ${err}`)

            if(err instanceof ServerError) return done(err);
            return done(new ServerError("Internal error has occured."));
        }
    }).catch(err => {
        console.log(err)
    })
}

// amount, publickey, wallet
async function getAirdropAmounts(wager: WagerSchema): Promise<Array<AirdropAmount> | null> {
    const airdropAmounts: Array<AirdropAmount> = [];

    if(wager.status === "completed") {
        const completedWager: WagerSchema | null = await Wager.findOne({ '_id': wager._id, 'selections.winner': true }, 'selections.$');
        
        if(!completedWager) return null;

        const winningSelectionId = completedWager.selections[0]._id;

        const winningBets = await Wager.aggregate([
            {
                $match: {
                    placedBets: {
                        $elemMatch: {
                            selectionId: winningSelectionId
                        }
                    }
                }
            },
            {
                $unwind: '$placedBets'
            },
            {
                $match: { 'placedBets.selectionId': winningSelectionId },
            },
            {
                $replaceRoot: {  newRoot: "$placedBets"  }
            }
        ])

        const winningWallet: Keypair | null = await getEscrowWallet(winningSelectionId);

        if(!(winningBets && winningWallet)) return null;

        for(const placedBet of winningBets) {
            // Ensure transfer has not ran
            if(placedBet.transferData?.error !== 0) continue;

            const toPubkey = new PublicKey(placedBet.publicKey);
            airdropAmounts.push({
                amount: placedBet.winAmount,
                toPubkey,
                fromKeypair: winningWallet,
                selectionId: winningSelectionId
            });
        }

        return airdropAmounts;
    } 

    const wagerEscrows: { [key: string]: Keypair } = {};

    for(const selection of wager.selections) {
        const escrowKeypair = await getEscrowWallet(selection._id);

        if(!escrowKeypair) return null;

        wagerEscrows[JSON.stringify(selection._id)] = escrowKeypair;
    }

    for(const placedBet of wager.placedBets) {
         // Ensure transfer has not ran
         if(placedBet.transferData.error !== 0) continue;

        const userBetAmounts = placedBet.amounts.map((betAmount) => betAmount.amount);
        const totalUserBetAmount = userBetAmounts.reduce((a, b) => a + b, 0);
        const toPubkey = new PublicKey(placedBet.publicKey);

        airdropAmounts.push({
            amount: totalUserBetAmount,
            toPubkey,
            fromKeypair: wagerEscrows[JSON.stringify(placedBet.selectionId)],
            selectionId: placedBet.selectionId
        });
    }

    return airdropAmounts;
}

async function setAirdropProgress(wagerId: ObjectId, status: boolean) {
    try {
        await Wager.findByIdAndUpdate(wagerId, { airdropProgress: status })
    } catch (err) {
        console.log(err)
    }
}

export async function getAirdropProgress(wagerId: ObjectId, checkCompleted?: boolean): Promise<boolean> {
    try {
        const wager: WagerSchema | null = await Wager.findById(wagerId);
        if(!wager) return true;

        if(checkCompleted && wager.status !== "completed") return true;

        return wager.airdropProgress;
    } catch (err) {
        console.log(err)
        return true;
    }
}