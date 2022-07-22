import express from "express";
import { ObjectId } from "mongodb";
import { ServerError } from "../misc/serverError";
import { getObjectId } from "../misc/utils";
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
    const { title, 
        selection1, 
        selection1img, 
        selection1winnerImg, 
        selection2, 
        selection2img, 
        selection2winnerImg, 
        startDate, 
        endDate, gameDate } = req.body;

    if (!(title && selection1 && selection2 && selection1img && selection1winnerImg
         && selection2img && selection2winnerImg && startDate && endDate && gameDate) || 
        new Date(startDate) > new Date(endDate)) // Ensures end date > start date
        {
            res.status(400).send({ message: "Invalid input", data: {} });
            return;
    }
  
    const result = await createWager(title, 
        selection1, 
        selection1img, 
        selection1winnerImg, 
        selection2, 
        selection2img, 
        selection2winnerImg, 
        startDate, 
        endDate, 
        gameDate);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Created wager", data: result })    
})

router.post('/declareWinner', async (req, res) => { 
    const { selectionId } = req.body;

    const selectionObjectId = getObjectId(selectionId);

    if(!selectionObjectId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await declareWinner(selectionObjectId)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Declared winner", data: result })
})

router.post('/airdrop', async (req, res) => { 
    const { wagerId } = req.body;

    const wagerObjectId = getObjectId(wagerId);

    if(!wagerObjectId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;  
    }

    const airdropProgress = await getAirdropProgress(wagerObjectId, true);

    if(airdropProgress) {
        res.status(400).send({ message: "Airdrop already initiated or wager is not completed.", data: {} });
        return;
    }

    airdrop(wagerObjectId);

    res.status(200).json({ message: "Initiated airdrop", data: {} })
})

router.post('/cancelWager', async (req, res) => { 
    const { wagerId } = req.body;

    const wagerObjectId = getObjectId(wagerId);

    if(!wagerObjectId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await cancelWager(wagerObjectId)

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