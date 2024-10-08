import { ObjectId } from "mongodb";
import { TokenBalanceResult, TweetType, WagerSchema, WagerUser } from "../misc/types";
import { getTokenBalanceChange } from "./solana";
import Wager from '../model/wager';
import User from '../model/user';
import { ServerError } from "../misc/serverError";
import { FEE_MULTIPLIER, LOGTAIL } from "../config/database";
import { tweetImage } from "../misc/imageUtils";
import { addToTotalGamesPlayed, addToTotalPoints, getOrCreateUser } from "../misc/userUtils";
import { broadcastAndSaveActivity } from "../config/websocket";

export default async function placeBet(wagerId: ObjectId, selectionId: ObjectId, signature: string): Promise<TokenBalanceResult | ServerError> {
    try {
        // Ensure wager is live and selection id exists on wager
        const wagerData: WagerSchema | null = await Wager.findOne({ _id: wagerId, status: "live" })

        if(!wagerData) throw new ServerError("Wager is not available.");

        // const wagerPubkey = wagerData.selections[0]?.publicKey;
        const selectedSelection = wagerData.selections.find((selection) => selection._id.equals(selectionId));
        const otherSelection = wagerData.selections.find((selection) => !selection._id.equals(selectionId));

        if(!selectedSelection) throw new ServerError("Selection is not available.");
        if(!otherSelection) throw new ServerError("Other selection is not available.");

        const wagerPubkey = selectedSelection?.publicKey;

        if(!wagerPubkey) throw new ServerError("No live wager or selection was not found.");

        // Confirm unique sig TODO: make sure you can fault sig (adding spaces)

        // TODO: Remove selection.publicKey check (so you check across all wagers instead... (MULTIPLE GAMES))
        const usedSig = await Wager.findOne({'selections.publicKey': wagerPubkey, 'placedBets.amounts.signature': signature });
        
        if(usedSig) {
           throw new ServerError("Transaction signature already used");
        }

        // Confirm signature (confirms balance diff, publickey)
        const amountBet = await getTokenBalanceChange(signature, wagerPubkey, wagerData.token);

        if(amountBet === null) {
            throw new ServerError("Invalid transaction signature");
        }

        const finalBetAmount = amountBet.amount;

        const publicKey = amountBet.userPublicKey;

        const user: WagerUser | null = await getOrCreateUser(publicKey);

        const username = user?.twitterData?.username || undefined;

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
                selectionId
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
        });

        // Update user stats
        await Promise.all([
            addToTotalGamesPlayed(publicKey),
            addToTotalPoints(publicKey)
        ]);

        broadcastAndSaveActivity(user, 'placeBet', selectedSelection.title, finalBetAmount);
        
        // Tweet image
        tweetImage(TweetType.GAME_PICK, wagerData, publicKey, finalBetAmount, selectedSelection.title, otherSelection.title, user || undefined);

        LOGTAIL.info(`${publicKey} placed a bet of ${finalBetAmount}`)

        return amountBet;
    } catch (err) {
        LOGTAIL.error(`Error placing bet on wager ${wagerId} ${signature} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}

