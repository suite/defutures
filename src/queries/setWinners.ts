import { ObjectId } from "mongoose"
import { WagerBetSchema, WagerSchema } from "../misc/types";
import Wager from '../model/wager';
import { ServerError } from "../misc/serverError";
import { PAYOUT_PRECISION } from "../config/database";

export default async function setWinners(winningSelection: ObjectId) {
    try {
        const wager: WagerSchema | null = await Wager.findOne({'selections._id': winningSelection }, { 'selections.$': 1 })

        if(!wager) throw new ServerError('Could not find winning wager.');
        
        const selection = wager.selections[0];
        const selectionId = selection._id;

        if(!(selection && selectionId)) throw new ServerError("No wager/selection found");

        const userBets: WagerSchema | null = await Wager.findOne({ 'placedBets.selectionId': selectionId }, { 'placedBets.$': 1, 'selections': 1 })

        if(!userBets) throw new ServerError('Could not find completed user bets.');

        // Determine total volume across all selections
        const wagerBetAmounts = userBets.selections.map((selection) => selection.totalSpent);
        const totalWagerVolume = wagerBetAmounts.reduce((a, b) => a + b, 0);

        // Get winning selection volume
        const winningSelectionVolume = selection.totalSpent;

        // Calculate payout odds
        let payoutMultiplier = totalWagerVolume / winningSelectionVolume;
 
        for(const placedBet of userBets.placedBets) {
            const payout = calculateWinnings(placedBet, payoutMultiplier)

            const placedBetsFilter = {
                placedBets: {
                    $elemMatch: {
                        selectionId: placedBet.selectionId,
                        publicKey: placedBet.publicKey
                    }
                }
            }

            await Wager.updateOne(placedBetsFilter, { 'placedBets.$.winAmount': payout });
        }
        
    } catch (err) {
        console.log(err)
        throw new ServerError("Error setting winners.")
    }
} 

function calculateWinnings(userBet: WagerBetSchema, payoutMultiplier: number): number {
    // Calculate total spent on winning team
    const userBetAmounts = userBet.amounts.map((betAmount) => betAmount.amount);
    const totalUserBetAmount = userBetAmounts.reduce((a, b) => a + b, 0);

    // Calculate final winnings
    let totalWinnings = totalUserBetAmount * payoutMultiplier;
    totalWinnings = Math.floor(totalWinnings * PAYOUT_PRECISION) / PAYOUT_PRECISION;

    return totalWinnings;
}