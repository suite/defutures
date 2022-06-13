import { ObjectId } from "mongodb";
import { FEE_MULTIPLIER, PAYOUT_PRECISION } from "../config/database";
import { WagerSchema, WagerWalletSchema } from "../misc/types";
import { getKeypair, transferSplToken } from "./solana";
import WagerWallet from '../model/wagerWallet';
import Wager from '../model/wager';
import { PublicKey } from "@solana/web3.js";
import { ServerError } from "../misc/serverError";

// add "data" and "message" to each req
export default async function claimWinnings(wagerId: ObjectId, publicKey: string): Promise<number | ServerError> {
    try {
        const wager: WagerSchema | null = await Wager.findOne({ 
            _id: wagerId, 
            status: 'completed', 
            'selections.winner': true }, { 'selections.$': 1 })

        if(!wager) throw new ServerError('Could not find completed wager.')

        const selection = wager.selections[0];
        const selectionId = selection._id;

        if(!(selection && selectionId)) throw new ServerError("No wager/selection found"); // find clean way to "require else throw err"
        
        const placedBetsFilter = {
            placedBets: {
                $elemMatch: {
                    selectionId,
                    publicKey,
                    claimed: false
                }
            }
        }

        const userBet: WagerSchema | null = await Wager.findOne(placedBetsFilter, { 'placedBets.$': 1, 'selections': 1 });

        if(!userBet) throw new ServerError('User did not bet on winning selection or has already claimed.')

        // Determine total volume across all selections
        const wagerBetAmounts = userBet.selections.map((selection) => selection.totalSpent * FEE_MULTIPLIER);
        const totalWagerVolume = wagerBetAmounts.reduce((a, b) => a + b, 0);

        // Get winning selection volume
        const winningSelectionVolume = selection.totalSpent * FEE_MULTIPLIER;

        // Calculate payout odds, truncate after PAYOUT_PRECISION
        let payoutMultiplier = totalWagerVolume / winningSelectionVolume;
        payoutMultiplier = Math.floor(payoutMultiplier * PAYOUT_PRECISION) / PAYOUT_PRECISION;

        // Calculate total spent on winning team
        const userBetAmounts = userBet.placedBets[0].amounts.map((betAmount) => betAmount.amount * FEE_MULTIPLIER);
        const totalUserBetAmount = userBetAmounts.reduce((a, b) => a + b, 0);

        // Calculate final winnings
        let totalWinnings = totalUserBetAmount * payoutMultiplier;
        totalWinnings = Math.floor(totalWinnings * PAYOUT_PRECISION) / PAYOUT_PRECISION;

        // Send solana tx
        const winnerWallet: WagerWalletSchema | null = await WagerWallet.findOne({ selectionId })
        if(!winnerWallet) throw new ServerError("Could not find winning selection wallet");

        const winnerWalletKeypair = await getKeypair(winnerWallet.privateKey) // make getkeypair throw
        if(!winnerWalletKeypair) throw new ServerError("Could not read losing wallet keys");

        // SET claimed to true, if transaction fails set back to false

        const tx = await transferSplToken(winnerWalletKeypair, new PublicKey(publicKey), totalWinnings);

        console.log(`Transfering ${totalWinnings} from ${winnerWallet.publicKey} to ${publicKey} tx: ${tx}`)

        await Wager.updateOne(placedBetsFilter, { 'placedBets.$.claimed': true });

        // consider fees / already claimed
        // better loggin 
        return totalWinnings;

    } catch (err) {
        console.log(err)
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}
