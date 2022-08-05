import { TOKEN_MINT, CONNECTION, FUND_KEYPAIR, KEY, SALT, ALGORITHM, LOGTAIL } from "../config/database";
import { SplTransferResult, TokenBalanceResult } from "../misc/types";
import crypto from "crypto";
import * as splToken from "@solana/spl-token";
import * as web3 from '@solana/web3.js';
import { ServerError } from "../misc/serverError";
const bip39 = require('bip39');

export async function transferSplToken(fromKeypair: web3.Keypair, toPubkey: web3.PublicKey, amount: number): Promise<SplTransferResult> {
    let signature = undefined;
    try {
        // Assume escrow has token account created
        const fromTokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MINT, fromKeypair.publicKey);
        
        // Ensure destination has token acount
        const toTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(CONNECTION, FUND_KEYPAIR, TOKEN_MINT, toPubkey);

        const transferAmount = getTransferAmount(amount)

        signature = await splToken.transfer(
            CONNECTION,
            FUND_KEYPAIR,
            fromTokenAccount,
            toTokenAccount.address,
            fromKeypair,
            transferAmount,
        )

        const result = await CONNECTION.confirmTransaction(signature, "confirmed");

        if(result.value.err) {
            LOGTAIL.error(`Transfer spl err ${JSON.stringify(result.value)} for tx ${signature}`)
            
            return {
                signature,
                error: 1
            }
        }

        LOGTAIL.info(`Transferred ${transferAmount} tokens to ${toPubkey.toString()}`)

        return { signature, error: -1 };
    } catch (error) {
        LOGTAIL.info(`Error transferring ${amount} ${toPubkey.toString()} ${error}`);

        return {
            signature,
            error: 2
        }
    }
}

function getTransferAmount(amount: number) {
    return Math.floor(amount * web3.LAMPORTS_PER_SOL)
}

export async function getBalance(publicKey: web3.PublicKey): Promise<number> {
    try {
        const tokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MINT, publicKey);
        const dustBal = (await CONNECTION.getTokenAccountBalance(tokenAccount)).value.uiAmount;

        if(dustBal === null) throw new ServerError("Err fetching bal");

        return dustBal;
    } catch (err) {
        LOGTAIL.error(`Error getting balance for ${publicKey.toString()} ${err}`)
        throw new ServerError("Err fetching bal");
    }
}

export async function getKeypair(secretString: string): Promise<web3.Keypair> {
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
        LOGTAIL.error(`Error getting keypair ${err}`)
        throw new ServerError("Error parsing private key.");
    }
}

export async function getTokenBalanceChange(signature: string, escrowWallet: string): Promise<TokenBalanceResult | null> {
    try {
        const transactionDetails = await CONNECTION.getParsedTransaction(signature, 'confirmed');

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
    } catch (err) {
        LOGTAIL.error(`Error getting token balance change ${err}`)
        return null;
    }
}