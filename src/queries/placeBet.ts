import { ObjectId } from "mongodb";
import { TokenBalanceResult } from "../misc/types";
import { getTokenBalanceChange } from "./solana";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";
import { FEE_MULTIPLIER, LOGTAIL } from "../config/database";

export default async function placeBet(wagerId: ObjectId, selectionId: ObjectId, signature: string): Promise<TokenBalanceResult | ServerError> {
    try {
        // Ensure wager is live and selection id exists on wager
        const wagerData = await Wager.findOne({ _id: wagerId, status: "live", 'selections._id': selectionId }, {'selections.$': 1, 'endDate': 1})

        if(!wagerData) throw new ServerError("Wager is not available.");

        const wagerPubkey = wagerData.selections[0]?.publicKey;

        if(!wagerPubkey) throw new ServerError("No live wager or selection was not found.");

        // Confirm unique sig TODO: make sure you can fault sig (adding spaces)
        const usedSig = await Wager.findOne({'selections.publicKey': wagerPubkey, 'placedBets.amounts.signature': signature });
        
        if(usedSig) {
           throw new ServerError("Transaction signature already used");
        }

        // Confirm signature (confirms balance diff, publickey)
        const amountBet = await getTokenBalanceChange(signature, wagerPubkey);

        if(amountBet === null) {
            throw new ServerError("Invalid transaction signature");
        }

        const finalBetAmount = amountBet.amount;

        const publicKey = amountBet.userPublicKey;

        // Add them to placedBets, increase totalUsers if no past bets
        await Wager.updateOne({ 
            _id: wagerId, 
            'selections._id': selectionId,
            placedBets: {
                $not: {
                    $elemMatch: {
                        selectionId,
                        publicKey
                    }
                }
            }
        }, 
        { 
            $push: { placedBets: {
                publicKey,
                selectionId,
            }},
            $inc: {
                'selections.$.totalUsers': 1
            }  
        })

        const placedBetsFilter = {
            placedBets: {
                $elemMatch: {
                    selectionId,
                    publicKey,
                }
            },
            'placedBets.amounts.signature': { $ne: signature }
        }

        // Add bet amount (Filter checks for used sig)
        const addedBet = await Wager.updateOne(placedBetsFilter, { 
            $push: { 'placedBets.$.amounts': {
                amount: finalBetAmount,
                signature
            }}
        })

        // If tx sig is invalid and was not added, stop here and do not add to totalSpent
        if(addedBet.modifiedCount === 0) return new ServerError("Transaction signature already used");

        // Update total spent TODO: Only add if confirmed
        await Wager.updateOne({ _id: wagerId, 'selections._id': selectionId }, { 
            $inc: { 'selections.$.totalSpent': finalBetAmount }
        })

        LOGTAIL.info(`${publicKey} placed a bet of ${finalBetAmount}`)

        return amountBet;
    } catch (err) {
        LOGTAIL.error(`Error placing bet on wager ${wagerId} ${signature} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}

