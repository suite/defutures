import { ObjectId } from "mongodb";
import { LOGTAIL, FUND_KEYPAIR } from "../config/database";
import { ServerError } from "../misc/serverError";
import { WagerSchema } from "../misc/types";
import { getWagerEscrowWallet } from "../misc/utils";
import Wager from '../model/wager';
import { getBalance, transferToken } from "./solana";
import { PublicKey } from "@solana/web3.js";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default async function sendFees(wagerId: ObjectId) {
    try {
        const wager: WagerSchema | null = await Wager.findById(wagerId)

        if(!wager) throw new ServerError("Unable to query wager.");

        if(!(wager.airdropProgress === true && wager.status === "completed")) {
            throw new ServerError("Wager is not ready for sending fees.");
        }

        // 10 Second delay to ensure all airdrops are completed
        await delay(10000);

        const winningSelection = wager.selections.filter((selection) => selection.winner === true)[0];

        const winnerWalletKeypair = await getWagerEscrowWallet(winningSelection._id);
        const walletBalance = await getBalance(winnerWalletKeypair.publicKey, wager.token);

        if(!wager.isAdmin) {
            // Send half to FUND_KEYPAIR.publicKey, and have to wager.creator.publickEy
            const firstBatch = Math.floor((walletBalance / 2) * 100) / 100;
            const secondBatch = walletBalance - firstBatch;

            const tx1 = await transferToken(winnerWalletKeypair, FUND_KEYPAIR.publicKey, firstBatch, wager.token);

            LOGTAIL.info(`Transfering ${firstBatch} from ${winnerWalletKeypair.publicKey.toString()} to ${FUND_KEYPAIR.publicKey.toString()} tx: ${tx1.signature}`)

            if(tx1.error !== -1) throw new ServerError(`Err transfering Solana. Tx: ${tx1.signature}`);

            const tx2 = await transferToken(winnerWalletKeypair, new PublicKey(wager.creator.publicKey), secondBatch, wager.token);
            
            LOGTAIL.info(`Transfering ${secondBatch} from ${winnerWalletKeypair.publicKey.toString()} to ${wager.creator.publicKey.toString()} tx: ${tx2.signature}`)
        } else {
            const tx = await transferToken(winnerWalletKeypair, FUND_KEYPAIR.publicKey, walletBalance,  wager.token);

            LOGTAIL.info(`Transfering ${walletBalance} from ${winnerWalletKeypair.publicKey.toString()} to ${FUND_KEYPAIR.publicKey.toString()} tx: ${tx.signature}`)
    
            if(tx.error !== -1) throw new ServerError(`Err transfering Solana. Tx: ${tx.signature}`);
        }

        LOGTAIL.info(`Moved fee funds for wager ${wagerId}`)

        return true;
    } catch (err) {
        LOGTAIL.error(`Error sending fees for wager ${wagerId} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}