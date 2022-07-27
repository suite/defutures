import bs58 from "bs58";
import express from "express";
import nacl from "tweetnacl";
import { getObjectId, isValidPubKey, isWhitelisted } from "../misc/utils";
import Wager from "../model/wager";
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import placeBet from "../queries/placeBet";
import { KEY } from "../config/database";
import { ServerError } from "../misc/serverError";
import getUserWager from "../queries/getUserWager";
import { WagerSchema } from "../misc/types";

const router = express.Router();

// generate nonce
// login
// wagers (select values to be shown)
// place bet

const nonces: { [key: string]: string } = {};

router.post('/generateNonce', async (req, res) => {
    const { publicKey } = req.body;

    const whitelisted = await isWhitelisted(publicKey);

    if(!whitelisted) {
        res.status(400).json({ nonce: ""})
        return;
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    
    nonces[publicKey] = nonce;

    res.status(200).json({ nonce })
})

router.post('/login', async (req, res) => {
    const { publicKey, signedMessage } = req.body;

    const whitelisted = await isWhitelisted(publicKey);

    if(!whitelisted || !signedMessage) {
        res.status(400).json({ verified: false })
        return;
    }

    try {
        const nonceUint8 = new TextEncoder().encode(nonces[publicKey]);
        const signatureUint8 = Uint8Array.from(Buffer.from(signedMessage, 'hex'));
        const pubKeyUint8 = bs58.decode(publicKey);
    
        const verified = nacl.sign.detached.verify(nonceUint8, signatureUint8, pubKeyUint8);
        
        if(!verified) {
            res.status(400).json({ verified: false })
            return;
        }

        const token = jwt.sign({ publicKey }, KEY, { "expiresIn": "2h" });
        
        res.cookie("access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax'
        }).status(200).json({ verified })

    } catch (err) {
        res.status(400).json({ verified: false })
    }
})

router.get('/wagers', async (req, res) => {
    try {
        const wagers: Array<WagerSchema> = await Wager.find({}, { 
            title: 1,
            status: 1,
            selections: 1,
            startDate: 1,
            endDate: 1,
            gameDate: 1,
            _id: 1
         })

        wagers.filter(wager => wager.status !== 'live')
                                    .map(wager => wager.selections.map(sel => sel.publicKey = ''))
        
        res.status(200).json(wagers)
    } catch (err) {
        return res.sendStatus(500);
    }   
})

router.post('/placeBet', async (req, res) => {
    const { wagerId, selectionId, signature } = req.body;

    const wagerObjectId = getObjectId(wagerId);
    const selectionObjectId = getObjectId(selectionId);

    if (!(wagerObjectId && selectionObjectId && signature)) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await placeBet(wagerObjectId, selectionObjectId, signature);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Placed bet", data: result })
})

router.post('/getUserWager', async (req, res) => {
    const { wagerId, publicKey } = req.body;

    const wagerObjectId = getObjectId(wagerId);

    if (!(wagerObjectId && isValidPubKey(publicKey))) {
        res.status(400).send({ message: "Invalid input", data: {} });
        return;
    }

    const result = await getUserWager(wagerObjectId, publicKey);

    if(result instanceof ServerError) {
        return res.status(400).json({ message: result.message, data: result }) 
    }

    res.status(200).json({ message: "Fetched user wager", data: result })
})

export default router;