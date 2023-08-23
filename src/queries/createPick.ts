import { PickSchema, PickSelectionSchema } from "../misc/types";
import { AGENDA, LOGTAIL } from "../config/database";
import { ServerError } from "../misc/serverError";
import Pick from '../model/pick';
import { createPickEscrow } from "./createWagerEscrows";

export default async function createPick(title: string,
    description: string,
    entryFee: number,
    startDate: number,
    endDate: number,
    selections: Array<PickSelectionSchema>): Promise<PickSchema | ServerError> {
        try {
            const currentTime = new Date().getTime();

            const pickOptions = {
                title,
                description,
                entryFee,
                startDate,
                endDate,
                selections
            }

            const pick: PickSchema = await Pick.create(pickOptions)

            // Create escrow wallet for the wager
            const createdEscrows = await createPickEscrow(pick._id);
            if(!createdEscrows) {
                // Delete wager if error
                await Pick.findByIdAndDelete(pick._id);
    
                throw new ServerError("Error creating pick wallet.");
            }

            if(startDate > currentTime) {
                await AGENDA.schedule(new Date(startDate), "update pick", {
                    status: 'live',
                    pickId: pick._id
                });
            } else {
                await Pick.findByIdAndUpdate(pick._id, { status: 'live' })
            }
            
            await AGENDA.schedule(new Date(endDate), "update pick", {
                status: 'closed',
                pickId: pick._id
            });
    
            LOGTAIL.info(`Created pick ${pick._id}`)
            
            return pick;
        } catch (err) {
            LOGTAIL.error(`Error creating pick ${err}`)
        
            if(err instanceof ServerError) return err;
            return new ServerError("Internal error has occured.");
        }

}