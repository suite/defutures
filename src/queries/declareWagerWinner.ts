import { ObjectId } from "mongodb";
import { TweetType, WagerSchema, WagerUser, WagerWalletSchema } from "../misc/types";
import { getKeypair, getBalance, transferToken } from "./solana";
import WagerWallet from '../model/wagerWallet';
import Wager from '../model/wager';
import { PublicKey } from "@solana/web3.js";
import { ServerError } from "../misc/serverError";
import setWinners from "./setWinners";
import { getWagerEscrowWallet } from "../misc/utils";
import { LOGTAIL } from "../config/database";
import setLosers from "./setLosers";
import airdrop from "./airdrop";
import { tweetImage } from "../misc/imageUtils";
import { addToTotalGamesAirDropped, addToTotalGamesCreated, addToTotalPoints, updateCraziestUpset, updateHottestPool } from "../misc/userUtils";

export default async function declareWagerWinner(creator: WagerUser, wagerId: ObjectId, selectionId: ObjectId, finalScore?: string): Promise<boolean | ServerError> {
    try {
        // Move losing funds to winning wallet
        const wager: WagerSchema | null = await Wager.findOne({ 'selections._id': selectionId })
        if(!wager) throw new ServerError("Unable to query wager.");

        // Ensure user created game
        if(!creator.roles.includes("ADMIN")) {
            // ROLE-CHECK: Publickey check for manage
            if(creator.publicKey !== wager.creator.publicKey) {
                throw new ServerError("You are not the creator of this wager.");
            }
        }

        // Winner already selected or wager still live/upcoming 
        const otherWinners = await Wager.findOne({ 'selections._id': selectionId, $or: [{'status': 'completed'}, {'status': { $ne: 'closed' }}] })
        if(otherWinners) throw new ServerError("Unable to declare winner. Either winner already selected or game is not closed.");

        const losingSelection = wager.selections.filter((selection) => JSON.stringify(selection._id) !== JSON.stringify(selectionId))[0];
        const winningSelection = wager.selections.filter((selection) => JSON.stringify(selection._id) === JSON.stringify(selectionId))[0];

        const loserSelectionPubkey = new PublicKey(losingSelection.publicKey);
        const winnerSelectionPubkey = new PublicKey(winningSelection.publicKey);
    
        const loserWalletKeypair = await getWagerEscrowWallet(losingSelection._id);

        const loserWalletBalance = await getBalance(loserSelectionPubkey, wager.token);

        const tx = await transferToken(loserWalletKeypair, winnerSelectionPubkey, loserWalletBalance, wager.token);

        LOGTAIL.info(`Transfering ${loserWalletBalance} from ${loserSelectionPubkey.toString()} to ${winnerSelectionPubkey.toString()} tx: ${tx.signature}`)

        if(tx.error !== -1) throw new ServerError(`Err transfering Solana. Tx: ${tx.signature}`);

        await setWinners(selectionId);
        await setLosers(losingSelection._id)

        // Finally update status
        const statusUpdate = {
            'selections.$.winner': true,
            'status': 'completed',
            'finalScore': ''
        };

        if(finalScore) {
            statusUpdate['finalScore'] = finalScore;
        }

        await Wager.updateOne({ 'selections._id': selectionId }, { '$set': statusUpdate })

        airdrop(wagerId);

        LOGTAIL.info(`Delcared selection ${selectionId} as winner and started airdrops`);


        // *******  Update user stats  *******
        const totalBets = wager.placedBets.reduce((acc, bet) => acc + bet.amounts.length, 0);

        const wagerBetAmounts = wager.selections.map((selection) => selection.totalSpent);
        const totalWagerVolume = wagerBetAmounts.reduce((a, b) => a + b, 0);

        // Get winning selection volume
        const winningSelectionVolume = winningSelection.totalSpent;

        // Calculate payout odds
        let payoutMultiplier = totalWagerVolume / winningSelectionVolume;
        payoutMultiplier = Math.round(payoutMultiplier * 100) / 100;

        // Update user stats
        await Promise.all([
            addToTotalPoints(creator.publicKey),
            addToTotalGamesAirDropped(creator.publicKey),
            addToTotalGamesCreated(creator.publicKey),
            updateHottestPool(creator.publicKey, totalBets),
            updateCraziestUpset(creator.publicKey, payoutMultiplier)
        ]);
        // *******  Update user stats  *******

        const refreshedWager: WagerSchema | null = await Wager.findById(wagerId);
        if(refreshedWager) {
            tweetImage(TweetType.GAME_WINNERS, refreshedWager, "", 0, "", "");
        } else {
            LOGTAIL.error(`Unable to tweet winners for ${wagerId}`);
        }

        return true;
    } catch (err) {
        LOGTAIL.error(`Error declaring ${selectionId} as winner ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}