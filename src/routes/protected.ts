import express from "express";
import { ObjectId } from "mongoose";
import { ServerError } from "../misc/serverError";
import WagerWallet from "../model/wagerWallet";
import airdrop, { getAirdropProgress } from "../queries/airdrop";
import { cancelWager } from "../queries/cancelWager";
import createWager from "../queries/createWager";
import declareWinner from "../queries/declareWinner";

const router = express.Router();

router.get("/status", (req, res) => {
    res.status(200).json({ loggedIn: true })
})

router.post('/createWager', async (req, res) => {
    const { title, selection1, selection2, startDate, endDate, gameDate } = req.body;

    if (!(title && selection1 && selection2 && startDate && endDate && gameDate) || 
        new Date(startDate) > new Date(endDate)) // Ensures end date > start date
        {
            res.status(400).send({ message: "Invalid input", data: {} });
            return;
    }
  
    const result = await createWager(title, selection1, selection2, startDate, endDate, gameDate);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Created wager", data: result })    
})

router.post('/declareWinner', async (req, res) => { 
    const { selectionId } = req.body;

    if(!selectionId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await declareWinner(selectionId as ObjectId)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Declared winner", data: result })
})

router.post('/airdrop', async (req, res) => { 
    const { wagerId } = req.body;

    if(!wagerId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;  
    }

    const airdropProgress = await getAirdropProgress(wagerId as ObjectId, true);

    if(airdropProgress) {
        res.status(400).send({ message: "Airdrop already initiated or wager is not completed.", data: {} });
        return;
    }

    airdrop(wagerId as ObjectId);

    res.status(200).json({ message: "Initiated airdrop", data: {} })
})

router.post('/cancelWager', async (req, res) => { 
    const { wagerId } = req.body;

    if(!wagerId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await cancelWager(wagerId as ObjectId)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Cancelled wager", data: result })
})

router.get('/wallets', async (req, res) => {
    try {
        const wallets = await WagerWallet.find({})
        
        res.status(200).json(wallets)
    } catch (err) {
        return res.sendStatus(500);
    }   
})

export default router;