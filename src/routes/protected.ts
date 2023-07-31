import { Keypair } from "@solana/web3.js";
import base58 from "bs58";
import express from "express";
import { ObjectId } from "mongodb";
import { ServerError } from "../misc/serverError";
import { getObjectId, getPickEscrowWallet, getWagerEscrowWallet } from "../misc/utils";
import WagerWallet from "../model/wagerWallet";
import airdrop, { getAirdropProgress } from "../queries/airdrop";
import { cancelPick } from "../queries/cancelPick";
import { cancelWager } from "../queries/cancelWager";
import createPick from "../queries/createPick";
import createWager from "../queries/createWager";
import declarePickWinners from "../queries/declarePickWinners";
import declareWagerWinner from "../queries/declareWagerWinner";
import sendFees from "../queries/sendFees";

const router = express.Router();

router.get("/status", (req, res) => {
    res.status(200).json({ loggedIn: true })
})


router.post('/createPick', async (req, res) => {
    const { title, description, entryFee, startDate, endDate, selections } = req.body;

    if(!(title && description && entryFee && startDate && endDate && selections) || 
        new Date(startDate) > new Date(endDate)) {
            res.status(400).send({ message: "Invalid input", data: {} });
            return;
    }

    const result = await createPick(title, description, entryFee, startDate, endDate, selections);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Created pick", data: result })    
})

router.post('/declareWinner', async (req, res) => { 
    const { wagerId, selectionId, finalScore } = req.body;

    const selectionObjectId = getObjectId(selectionId);
    const wagerObjectId = getObjectId(wagerId);

    if(!selectionObjectId || !wagerObjectId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await declareWagerWinner(wagerId, selectionObjectId, finalScore)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Declared winner", data: result })
})

router.post('/declarePickWinners', async (req, res) => { 
    const { pickId, picks } = req.body;

    const pickObjectId = getObjectId(pickId);

    if(!(pickObjectId && picks)) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await declarePickWinners(pickObjectId, picks)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Declared winner", data: result })
})

router.post('/sendFees', async (req, res) => { 
    const { wagerId } = req.body;

    const wagerObjectId = getObjectId(wagerId);

    if(!wagerObjectId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await sendFees(wagerObjectId)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Sent fees", data: result })
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

    const result = await cancelWager(wagerObjectId);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Cancelled wager", data: result })
})

router.post('/cancelPick', async (req, res) => { 
    const { pickId } = req.body;

    const pickObjectId = getObjectId(pickId);

    if(!pickObjectId) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await cancelPick(pickObjectId)

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Cancelled pick", data: result })
})

router.get('/wallets', async (req, res) => {
    try {
        const wallets = await WagerWallet.find({})
        
        res.status(200).json(wallets)
    } catch (err) {
        return res.sendStatus(500);
    }   
})

router.get('/getPriv', async (req, res) => {
    try {
        const { gameId, isClassic } = req.query;

        const gameObjectId = getObjectId(gameId as string);

        if(!gameObjectId) {
            res.status(400).send({ message: "Invalid input", data: {} });
            return;
        }

        let wallet: Keypair;

        if(isClassic === 'true') {
            wallet = await getWagerEscrowWallet(gameObjectId);
        } else {
            wallet = await getPickEscrowWallet(gameObjectId);
        }

        res.status(200).json({
            pubKey: wallet.publicKey.toString(),
            privKey: wallet.secretKey.toString(),
            privKeyEncoded: base58.encode(wallet.secretKey)
         })
    } catch (err) {
        return res.sendStatus(500);
    }   
});

export default router;