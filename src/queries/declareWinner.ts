import { ObjectId } from "mongoose";
import { WagerSchema, WagerWalletSchema } from "../misc/types";
import { getKeypair, getBalance, transferSplToken } from "./solana";
import WagerWallet from '../model/wagerWallet';
import Wager from '../model/wager';
import { PublicKey } from "@solana/web3.js";
import { ServerError } from "../misc/serverError";

// !!!! finish up place bet, cleanup
export default async function declareWinner(selectionId: ObjectId): Promise<boolean | ServerError> {
    try {
        // Winner already selected or wager still live/upcoming 
        const otherWinners = await Wager.findOne({ 'selections._id': selectionId, $or: [{'status': 'completed'}, {'status': { $ne: 'closed' }}] })
        if(otherWinners) throw new ServerError("Unable to declare winner. Either winner already selected or game is not closed.");

        await Wager.updateOne({ 'selections._id': selectionId }, { '$set': {
            'selections.$.winner': true,
            'status': 'completed'
        }})

        // Move losing funds to winning wallet
        const wager: WagerSchema | null = await Wager.findOne({ 'selections._id': selectionId })

        if(!wager) throw new ServerError("Unable to query wager.");

        const losingSelection = wager.selections.filter((selection) => !selection.winner)[0];
        const winningSelection = wager.selections.filter((selection) => selection.winner)[0];

        const loserSelectionPubkey = new PublicKey(losingSelection.publicKey);
        const winnerSelectionPubkey = new PublicKey(winningSelection.publicKey);

        const loserWallet: WagerWalletSchema | null = await WagerWallet.findOne({ selectionId: losingSelection._id })
        
        if(!loserWallet) throw new ServerError("Could not find losing selection wallet");

        const loserWalletKeypair = await getKeypair(loserWallet.privateKey) // make getkeypair throw

        if(!loserWalletKeypair) throw new ServerError("Could not read losing wallet keys");

        const loserWalletBalance = await getBalance(loserSelectionPubkey)

        if(!loserWalletBalance) throw new ServerError("Err fetching bal");

        const tx = await transferSplToken(loserWalletKeypair, winnerSelectionPubkey, loserWalletBalance)

        console.log(`Transfering ${loserWalletBalance} from ${loserSelectionPubkey.toString()} to ${winnerSelectionPubkey.toString()} tx: ${tx}`)

        return true;
    } catch (err) {
        console.log(err);
        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}