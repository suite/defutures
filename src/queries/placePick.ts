import { ObjectId } from "mongodb";
import { LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import { PickSchema, PickTeam, TokenBalanceResult, WagerUser } from "../misc/types";
import Pick from '../model/pick';
import { getTokenBalanceChange } from "./solana";
import { getOrCreateUser } from "../misc/userUtils";

export default async function placePick(pickId: ObjectId, pickedTeams: Array<ObjectId>, tieBreaker: number, signature: string): Promise<TokenBalanceResult | ServerError> {
    try {
        const pickData: PickSchema | null = await Pick.findOne({ _id: pickId, status: "live" });

        if(!pickData) throw new ServerError("Pick is not available.");

        const pickPubkey = pickData.publicKey;

        if(!pickPubkey) throw new ServerError("Could not find pick publickey.");

        const usedSig = await Pick.findOne({'placedBets.amounts.signature': signature });
        
        if(usedSig) {
            throw new ServerError("Transaction signature already used");
        }


        //  Make sure tiebreaker is a number
        if(typeof tieBreaker !== "number") throw new ServerError("Invalid tiebreaker");

        // Make sure each pickedTeam is apart of a unique selection
        const pickedTeamsStringified = pickedTeams.map(team => JSON.stringify(team));
        const selectionsPicked: string[] = []
        
        for(const selection of pickData.selections) {
            for(const team of selection.teams) {
                if(pickedTeamsStringified.includes(JSON.stringify(team._id))) {
                    if(selectionsPicked.includes(JSON.stringify(selection._id))) {
                        throw new ServerError("Invalid team selection.")
                    }

                    selectionsPicked.push(JSON.stringify(selection._id))
                }
            }
        }

        // TODO: VALIDATE PICKED TEAMS!!!!!

        // const hasTiebreaker = pickData.selections.find(selection => selection.isTiebreaker);
        // const checkLength = hasTiebreaker ? pickData.selections.length - 1 : pickData.selections.length; 

        // // Confirm correct number of pickedTeams
        // if(pickedTeams.length !== checkLength) {
        //     throw new ServerError("Incorrect number of teams");
        // }

        // // Confirm no duplicate selections
        // const pickedSelections = [];
        // const pickedTeamsStringified = pickedTeams.map(team => JSON.stringify(team));
        // for(const selection of pickData.selections) {
        //     for(const team of selection.teams) {
        //         if(pickedTeamsStringified.includes(JSON.stringify(team._id))) {
        //             pickedSelections.push(selection._id);
        //         }
        //     }
        // }

        // const validPickedTeams = validatePickedTeams(pickData, pickedSelections);

        // if(!validPickedTeams) throw new ServerError("Invalid team selection.")

        // Confirm signature (confirms balance diff, publickey)
        const amountBet = await getTokenBalanceChange(signature, pickPubkey, "DUST");

        if(amountBet === null) {
            throw new ServerError("Invalid transaction signature");
        }

        const finalBetAmount = amountBet.amount;

        // Confirm entry amount
        if(Math.abs(pickData.entryFee - finalBetAmount) >= 0.1) {
            throw new ServerError("Invalid entry fee amount.");
        }

        const publicKey = amountBet.userPublicKey;  

        const user: WagerUser | null = await getOrCreateUser(publicKey);

        // Add them to placedBets, increase totalUsers
        await Pick.updateOne({
            _id: pickId, 
        }, 
        { 
            $push: { placedBets: {
                publicKey,
                pickedTeams,
                tieBreaker,
                amounts: [{
                    amount: finalBetAmount,
                    signature
                }],
                wagerUserId: user._id
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

function validatePickedTeams(pick: PickSchema, pickedTeams: Array<ObjectId>): boolean {
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
    
            selectionsPicked.push(JSON.stringify(pickedTeam))
        }
    
        return true;
    } catch (err) {
        return false;
    }
}