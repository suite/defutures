import { ConfirmedSignaturesForAddress2Options, PublicKey } from "@solana/web3.js";
import { TOKEN_MINT, CONNECTION } from "../config/database";
import { WagerSchema } from "../misc/types";
import placeBet from "./placeBet";
import Wager from '../model/wager';
import * as splToken from "@solana/spl-token";
import { ServerError } from "../misc/serverError";

export default async function findMissingEscrowTransactions(escrowPublicKey: PublicKey, lastTxSignature?: string): Promise<void> {
    try {
        const tokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MINT, escrowPublicKey);

        const options: ConfirmedSignaturesForAddress2Options = {
            before: lastTxSignature
        }

        const transactions = await CONNECTION.getConfirmedSignaturesForAddress2(tokenAccount, options);
            
        console.log(`Checking for escrow: ${escrowPublicKey.toString()} Num txs: ${transactions.length}`)

        for(const tx of transactions) {
            const dbHasSig = await Wager.findOne({ 'selections.publicKey': escrowPublicKey.toString(), 'placedBets.amounts.signature': tx.signature });
           
            if(!dbHasSig) {
                const wager: WagerSchema | null = await Wager.findOne({ 'selections.publicKey': escrowPublicKey.toString()}, { 'selections.$': 1 });
                if(!wager) continue;

                const selectionId = wager.selections[0]._id;
                const amount = await placeBet(wager._id, selectionId, tx.signature);
                if(!(amount instanceof ServerError)) {
                    console.log(`amount recovered: ${amount?.amount} selection ${selectionId}`)
                }
            }
        }
        
        if(transactions.length >= 1000) {
            // Recall function with options
            return await findMissingEscrowTransactions(escrowPublicKey, transactions[transactions.length - 1].signature)
        }
        
    } catch (err) {
        // TODO: might want to retry
        console.log(err)
    }
}