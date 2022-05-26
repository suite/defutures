import { TOKEN_MINT, CONNECTION, FUND_KEYPAIR, KEY, SALT, ALGORITHM } from "../config/database";
import { SplTransferResult, TokenBalanceResult } from "../misc/types";
import crypto from "crypto";
import * as splToken from "@solana/spl-token";
import * as web3 from '@solana/web3.js';
import { ServerError } from "../misc/serverError";
const bip39 = require('bip39');

// For declare winner, claim winnings
export async function transferSplToken(fromKeypair: web3.Keypair, toPubkey: web3.PublicKey, amount: number): Promise<SplTransferResult> {
    let signature = undefined;
    try {
        // Assume escrow has token account created
        const fromTokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MINT, fromKeypair.publicKey);
        
        // Ensure destination has token acount
        const toTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(CONNECTION, FUND_KEYPAIR, TOKEN_MINT, toPubkey);

        signature = await splToken.transfer(
            CONNECTION,
            FUND_KEYPAIR,
            fromTokenAccount,
            toTokenAccount.address,
            fromKeypair,
            amount * web3.LAMPORTS_PER_SOL,
        )

        const result = await CONNECTION.confirmTransaction(signature, "finalized");

        // TODO: RETRY  https://stackoverflow.com/questions/71419088/whats-a-better-way-to-handle-timed-out-awaiting-confirmation-on-transaction-e
        if(result.value.err) {
            console.log("Transfer spl err " + result.value.err.toString() + " for tx: " + signature)
            
            return {
                signature,
                error: new ServerError(result.value.err.toString())
            }
        }

        return { signature };
    } catch (error) {
        return {
            signature,
            error
        }
    }
}

export async function getBalance(publicKey: web3.PublicKey): Promise<number | null> {
    try {
        const tokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MINT, publicKey);
        const dustBal = (await CONNECTION.getTokenAccountBalance(tokenAccount)).value.uiAmount;

        return dustBal;
    } catch (err) {
        console.log(err)
        return null;
    }
}

export async function getKeypair(secretString: string): Promise<web3.Keypair | null> {
    try {
        const [encrypted, iv] = secretString.split("|");

        const key = crypto.scryptSync(KEY, SALT, 24);
    
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            key,
            Buffer.from(iv, "hex")
        );
        
        const final = decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
    
        const mnemonicBuffer = await bip39.mnemonicToSeed(final);
        const mnemonicSeed = new Uint8Array(mnemonicBuffer.toJSON().data.slice(0,32))
    
        return web3.Keypair.fromSeed(mnemonicSeed);
    } catch(err) {
        console.log(err)
        return null;
    }
}

// TODO: add option for backend to confirm sig? (check block time (confirm timezone))
export async function getTokenBalanceChange(signature: string, escrowWallet: string): Promise<TokenBalanceResult | null> {
    // const status = await CONNECTION.confirmTransaction(signature, "finalized");

    // // Transaction not confirmed yet
    // if(status.value.err) return null;
    
    const transactionDetails = await CONNECTION.getParsedTransaction(signature);

    if(!transactionDetails 
        || !transactionDetails.meta?.preTokenBalances 
        || !transactionDetails.meta?.postTokenBalances) return null;    

    // Pre token balances
    const preFilteredByMint = transactionDetails.meta.preTokenBalances
        .filter(bal => bal.mint === TOKEN_MINT.toString());

    const preTokenBalancesUser = preFilteredByMint.filter(bal => bal.owner !== escrowWallet);
    const preTokenBalancesEscrow = preFilteredByMint.filter(bal => bal.owner === escrowWallet);

    // Post token balances
    const postFilteredByMint = transactionDetails.meta.postTokenBalances
        .filter(bal => bal.mint === TOKEN_MINT.toString());
    
    const postTokenBalancesUser = postFilteredByMint.filter(bal => bal.owner !== escrowWallet);
    const postTokenBalancesEscrow = postFilteredByMint.filter(bal => bal.owner === escrowWallet);
    
    // Not a DUST transaction
    if(preTokenBalancesUser.length === 0 
        || postTokenBalancesUser.length === 0 
        || postTokenBalancesEscrow.length === 0) return null;

    // Somehow different owners
    if(preTokenBalancesUser[0].owner !== postTokenBalancesUser[0].owner) {
        return null;
    }

    const userPublicKey = preTokenBalancesUser[0].owner;

    if(!userPublicKey) return null;

    const preTokenAmountUser = preTokenBalancesUser[0].uiTokenAmount.uiAmount || 0;
    const postTokenAmountUser = postTokenBalancesUser[0].uiTokenAmount.uiAmount || 0;

    const preTokenAmountEscrow = preTokenBalancesEscrow[0]?.uiTokenAmount.uiAmount || 0;
    const postTokenAmountEscrow = postTokenBalancesEscrow[0].uiTokenAmount.uiAmount || 0;

    // const netUser = postTokenAmountUser - preTokenAmountUser;
    const netEscrow = postTokenAmountEscrow - preTokenAmountEscrow;

    // TODO: Might be able to fix
    const timestamp = transactionDetails.blockTime ? new Date(transactionDetails.blockTime * 1000) : undefined;

    return {
        amount: netEscrow,
        timestamp,
        userPublicKey
    };
}