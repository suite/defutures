import { CONNECTION, FUND_KEYPAIR, KEY, SALT, ALGORITHM, LOGTAIL, USE_DEV, TOKEN_MAP } from "../config/database";
import { TokenTransferResult, Token, TokenBalanceResult, WagerSchema, SplToken } from "../misc/types";
import crypto from "crypto";
import * as splToken from "@solana/spl-token";
import * as web3 from '@solana/web3.js';
import { ServerError } from "../misc/serverError";
const bip39 = require('bip39');

export async function transferToken(fromKeypair: web3.Keypair, toPubkey: web3.PublicKey, amount: number, token: Token): Promise<TokenTransferResult> {
    if(token === 'SOL') {
        return await transferSOL(fromKeypair, toPubkey, amount);
    }
    
    return await transferSplToken(fromKeypair, toPubkey, amount, token);
}

async function transferSOL(fromKeypair: web3.Keypair, toPubkey: web3.PublicKey, amount: number) {
    let signature = undefined;
    try {
        const tx = new web3.Transaction().add(
            web3.SystemProgram.transfer({
              fromPubkey: fromKeypair.publicKey,
              toPubkey: toPubkey,
              lamports: getTransferAmount(amount, "SOL"),
            })
        );
    
        tx.feePayer = FUND_KEYPAIR.publicKey;

        signature = await web3.sendAndConfirmTransaction(CONNECTION, tx, [FUND_KEYPAIR, fromKeypair], { commitment: 'confirmed' });

        LOGTAIL.info(`Transferred ${amount} SOL to ${toPubkey.toString()}`);
          
        return { signature, error: -1 };
    } catch (err) {
        LOGTAIL.error(`Error transferring ${amount} SOL to ${toPubkey.toString()} ${err}`);

        return {
            signature,
            error: 2
        }
    }
}
  
async function transferSplToken(fromKeypair: web3.Keypair, toPubkey: web3.PublicKey, amount: number, token: SplToken): Promise<TokenTransferResult> {
    let signature = undefined;
    try {
        // Assume escrow has token account created
        const fromTokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MAP[token].publicKey, fromKeypair.publicKey);
        
        // Ensure destination has token acount
        const toTokenAccount = await splToken.getOrCreateAssociatedTokenAccount(CONNECTION, FUND_KEYPAIR, TOKEN_MAP[token].publicKey, toPubkey);

        const transferAmount = getTransferAmount(amount, token);

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

export function getTransferAmount(amount: number, token: Token) {
    if(token === 'SOL') {
        return Math.floor(amount * web3.LAMPORTS_PER_SOL);
    }

    const decimals = TOKEN_MAP[token].decimals;
    return Math.floor(amount * Math.pow(10, decimals));
}

function lamportsToSol(lamports: number): number {
    return lamports * 1e-9;
} 

export async function getBalance(publicKey: web3.PublicKey, token: Token): Promise<number> {
    try {
        if(token === 'SOL') {
            const balance = await CONNECTION.getBalance(publicKey);
            return lamportsToSol(balance);
        }

        const tokenAccount = await splToken.getAssociatedTokenAddress(TOKEN_MAP[token].publicKey, publicKey);
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

// TODO: Add amount check (0.01 SOL, 1 dust, etc)
export async function getTokenBalanceChange(signature: string, escrowWallet: string, token: Token): Promise<TokenBalanceResult | null> {
    try {
        if(token === 'SOL') {
            return await getSOLTokenBalanceChange(signature, escrowWallet);
        }

        return await getSPLTokenBalanceChange(signature, escrowWallet, token);
    } catch (err) { 
        LOGTAIL.error(`Error getting token balance change ${err}`)
        return null;
    }
}

// Good for SPL token 
async function getSPLTokenBalanceChange(signature: string, escrowWallet: string, token: SplToken): Promise<TokenBalanceResult | null> {
    try {
        const transactionDetails = await CONNECTION.getParsedTransaction(signature, 'confirmed');


        // console.log(`Transaction details ${JSON.stringify(transactionDetails)}`)

        console.log(TOKEN_MAP)
        console.log("USE DEV? ", USE_DEV)
        console.log("Using mint key: ", TOKEN_MAP[token].publicKey.toString())

        if(!transactionDetails 
            || !transactionDetails.meta?.preTokenBalances 
            || !transactionDetails.meta?.postTokenBalances) throw new Error("No transaction details found");    

        // Pre token balances
        const preFilteredByMint = transactionDetails.meta.preTokenBalances
            .filter(bal => bal.mint === TOKEN_MAP[token].publicKey.toString());

        const preTokenBalancesUser = preFilteredByMint.filter(bal => bal.owner !== escrowWallet);
        const preTokenBalancesEscrow = preFilteredByMint.filter(bal => bal.owner === escrowWallet);

        // Post token balances
        const postFilteredByMint = transactionDetails.meta.postTokenBalances
            .filter(bal => bal.mint === TOKEN_MAP[token].publicKey.toString());
        
        const postTokenBalancesUser = postFilteredByMint.filter(bal => bal.owner !== escrowWallet);
        const postTokenBalancesEscrow = postFilteredByMint.filter(bal => bal.owner === escrowWallet);
        

        console.log(`Pre token balances user ${JSON.stringify(preTokenBalancesUser)}`)
        console.log(`Post token balances user ${JSON.stringify(postTokenBalancesUser)}`)
        console.log(`Pre token balances escrow ${JSON.stringify(preTokenBalancesEscrow)}`)

        // Not a DUST transaction
        if(preTokenBalancesUser.length === 0 
            || postTokenBalancesUser.length === 0 
            || postTokenBalancesEscrow.length === 0) throw new Error("Not a DUST transaction")

        // Somehow different owners
        if(preTokenBalancesUser[0].owner !== postTokenBalancesUser[0].owner) {
            throw new Error("Somehow different owners")
        }

        const userPublicKey = preTokenBalancesUser[0].owner;

        if(!userPublicKey) throw new Error("No user public key found");

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
            userPublicKey,
            token
        };
    } catch (err) {
        LOGTAIL.error(`Error getting token balance change ${err}`)
        console.log(`Error getting token balance change ${err}`)
        return null;
    }
}


//  TODO; edit frontend to handle spl and sol
async function getSOLTokenBalanceChange(signature: string, escrowWallet: string): Promise<TokenBalanceResult | null> {
    const MAX_RETRIES = 5;
    for(let i = 0; i < MAX_RETRIES; i++) {
        try {
            const transactionDetails = await CONNECTION.getParsedTransaction(signature, "confirmed");

            if(!transactionDetails) {
                throw new Error("No transaction details found");
            }
  
            const transferInstruction = transactionDetails.transaction.message.instructions.find(
              (instruction: web3.ParsedInstruction | web3.PartiallyDecodedInstruction) => {
                // Check if its of type ParsedInstruction
                if ((instruction as web3.ParsedInstruction).parsed) {
                  return (instruction as web3.ParsedInstruction).parsed.type === 'transfer'
                }
              }
            );
        
            if (!transferInstruction) {
              throw new Error("No transfer instruction found in the transaction data.");
            }
        
            const { lamports, source, destination } = (transferInstruction as web3.ParsedInstruction).parsed.info;
            
            if (!lamports || !source || !destination) {
              throw new Error("Required information is missing in the transaction data.");
            }

            if(destination !== escrowWallet) {
                return null;
            }
        
            return {
                amount: lamportsToSol(lamports),
                timestamp: transactionDetails.blockTime ? new Date(transactionDetails.blockTime * 1000) : undefined,
                userPublicKey: source,
                token: 'SOL'
            };
        } catch (err) {
            // TODO: infinite loop?
            
            LOGTAIL.error(`Error getting SOL token balance change ${err}`)
            if(i < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 1000));
            } else {
                return null;
            }
        }
    }
  
    return null;
}