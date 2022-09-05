import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { PickSchema, PickTeam, TokenBalanceResult } from "../misc/types";
import Pick from '../model/pick';
import { getTokenBalanceChange } from "./solana";


export default async function placePick(pickId: ObjectId, pickedTeams: Array<PickTeam>, signature: string): Promise<TokenBalanceResult | ServerError> {
    try {
        const pickData: PickSchema | null = await Pick.findOne({ _id: pickId, status: "live" });

        if(!pickData) throw new ServerError("Pick is not available.");

        const pickPubkey = pickData.publicKey;

        if(!pickPubkey) throw new ServerError("Could not find pick publickey.");

        const usedSig = await Pick.findOne({'placedBets.amounts.signature': signature });
        
        if(usedSig) {
            throw new ServerError("Transaction signature already used");
        }

        // Confirm correct number of pickedTeams
        const validPickedTeams = validatePickedTeams(pickData, pickedTeams);

        if(!validPickedTeams) throw new ServerError("Invalid team selection.")

        // Confirm signature (confirms balance diff, publickey)
        const amountBet = await getTokenBalanceChange(signature, pickPubkey);

        if(amountBet === null) {
            throw new ServerError("Invalid transaction signature");
        }

        const finalBetAmount = amountBet.amount;

        if(Math.abs(pickData.entryFee - finalBetAmount) >= 0.1) {
            throw new ServerError("Invalid entry fee amount.");
        }

        const publicKey = amountBet.userPublicKey;  

        // Add them to placedBets, increase totalUsers
        await Pick.updateOne({
            _id: pickId, 
        }, 
        { 
            $push: { placedBets: {
                publicKey,
                pickedTeams,
                amounts: [{
                    amount: finalBetAmount,
                    signature
                }]
            }},
            $inc: {
                'totalUsers': 1,
                'totalSpent': finalBetAmount
            }  
        });

        LOGTAIL.info(`${publicKey} placed a pick of ${finalBetAmount}`)

        return amountBet;
    } catch (err) {
        LOGTAIL.error(`Error placing pick on pick ${pickId} ${signature} ${err}`)

        if(err instanceof ServerError) return err;
        return new ServerError("Internal error has occured.");
    }
}

function validatePickedTeams(pick: PickSchema, pickedTeams: Array<PickTeam>): boolean {
    try {
        const numSeletions = pick.selections.length;

        // Picked correct number of teams
        if(pickedTeams.length !== numSeletions) return false;
    
        // Confrim they did not pick two from same selection
        const selectionsPicked: string[] = []
        for(const pickedTeam of pickedTeams) {
            if(selectionsPicked.includes(JSON.stringify(pickedTeam))) {
                return false;
            }
    
            selectionsPicked.push(JSON.stringify(pickedTeam.selectionId))
        }
    
        return true;
    } catch (err) {
        return false;
    }
}