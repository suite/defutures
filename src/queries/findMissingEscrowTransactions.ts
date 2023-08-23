import { ConfirmedSignaturesForAddress2Options, PublicKey } from "@solana/web3.js";
import { TOKEN_MAP, CONNECTION, LOGTAIL } from "../config/database";
import { Token, WagerSchema } from "../misc/types";
import placeBet from "./placeBet";
import Wager from '../model/wager';
import * as splToken from "@solana/spl-token";
import { ServerError } from "../misc/serverError";

// TODO: Test this
export default async function findMissingEscrowTransactions(escrowPublicKey: PublicKey, token: Token, lastTxSignature?: string, retries: number = 3): Promise<void> {
    try {
        let transactions = [];
        const options: ConfirmedSignaturesForAddress2Options = {
            before: lastTxSignature
        };
        
        if (token !== 'SOL') {
            // Check for SPL Token transactions
            const tokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MAP[token].publicKey, escrowPublicKey);
            transactions = await CONNECTION.getConfirmedSignaturesForAddress2(tokenAccount, options);
        } else {
            // Check for SOL transactions
            transactions = await CONNECTION.getConfirmedSignaturesForAddress2(escrowPublicKey, options);
        }
        
        LOGTAIL.info(`Checking for escrow: ${escrowPublicKey.toString()} Num txs: ${transactions.length}`);
        
        const signaturesInDB = await Wager.find({ 'selections.publicKey': escrowPublicKey.toString() }, { 'placedBets.amounts.signature': 1 });
        const knownSignatures = signaturesInDB.map(wager => wager.placedBets.amounts.signature);

        for(const tx of transactions) {
            if (!knownSignatures.includes(tx.signature)) {
                const wager: WagerSchema | null = await Wager.findOne({ 'selections.publicKey': escrowPublicKey.toString() }, { 'selections.$': 1 });
                if (!wager) continue;

                const selectionId = wager.selections[0]._id;
                const amount = await placeBet(wager._id, selectionId, tx.signature);
                if (!(amount instanceof ServerError)) {
                    LOGTAIL.info(`Amount recovered: ${amount?.amount} selection ${selectionId}`);
                }
            }
        }
        
        if (transactions.length >= 1000) {
            // Recall function with options
            LOGTAIL.info(`Over 1000 transactions, continuing search`);
            return await findMissingEscrowTransactions(escrowPublicKey, token, transactions[transactions.length - 1].signature);
        }
        
    } catch (err) {
        if (retries > 0) {
            LOGTAIL.warn(`Error checking missing transactions, retrying... Retries left: ${retries}`);
            return await findMissingEscrowTransactions(escrowPublicKey, token, lastTxSignature, retries - 1);
        } else {
            LOGTAIL.error(`Error checking missing transactions, no retries left... ${err}`);
        }
    }
}